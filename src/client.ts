import {
  buildFullPath,
  buildURL,
  parseHeaders,
  normalizeHeaderName,
  parseProtocol,
  stringifySafely,
  setContentTypeIfUnset,
  isFormData,
  isArrayBuffer,
  isBuffer,
  isStream,
  isFile,
  isBlob,
  isArrayBufferView,
  isURLSearchParams,
  isObject,
} from './helper';

export type Method =
  | 'get'
  | 'GET'
  | 'delete'
  | 'DELETE'
  | 'head'
  | 'HEAD'
  | 'options'
  | 'OPTIONS'
  | 'post'
  | 'POST'
  | 'put'
  | 'PUT'
  | 'patch'
  | 'PATCH';

export type RequetHeaders = Record<string, string | number>;

export type ResponseType = XMLHttpRequestResponseType;

export interface RequetConstructor {
  baseURL?: string;
  headers?: RequetHeaders;
  timeout?: number;
  responseType?: ResponseType;
}

export type RequetParams = Record<string, any>;

export interface RequestConfig extends RequetConstructor {
  url: string;
  method?: Method;
  params?: RequetParams;
  data?: RequetParams;
  withCredentials?: string;
}

export interface ReqeustResponse<D = any> {
  data: D;
  status: number;
  statusText: string;
  headers: RequetHeaders;
  config: RequestConfig;
  request?: any;
}

export type ParamsRequestOptions = Omit<
  RequestConfig,
  'method' | 'url' | 'params' | 'data'
>;
export type DataRequestOptions = Omit<RequestConfig, 'method' | 'url' | 'data'>;

class InterceptorManager<T = any> {
  public handlers: Array<{
    fulfilled: (value: T) => T | Promise<T>;
    rejected: (error: any) => any;
  } | null> = [];

  use(
    onFulfilled: (value: T) => T | Promise<T>,
    onRejected: (error: any) => any = () => {}
  ): number {
    this.handlers.push({
      fulfilled: onFulfilled,
      rejected: onRejected,
    });
    return this.handlers.length - 1;
  }

  eject(id: number): void {
    this.handlers[id] = null;
  }
}

function transformRequest(data: RequetParams, headers: RequetHeaders) {
  normalizeHeaderName(headers, 'Accept');
  normalizeHeaderName(headers, 'Content-Type');

  if (
    !data ||
    isFormData(data) ||
    isArrayBuffer(data) ||
    isBuffer(data) ||
    isStream(data) ||
    isFile(data) ||
    isBlob(data)
  ) {
    return data;
  }
  if (isArrayBufferView(data)) {
    return data.buffer;
  }
  if (isURLSearchParams(data)) {
    setContentTypeIfUnset(
      headers,
      'application/x-www-form-urlencoded;charset=utf-8'
    );
    return data.toString();
  }

  const isObjectPayload = isObject(data);
  const contentType = String((headers && headers['Content-Type']) || '');

  // todo 处理特殊数据
  // application/x-www-form-urlencoded
  // multipart/form-data
  // file

  if (isObjectPayload || contentType.indexOf('application/json') !== -1) {
    setContentTypeIfUnset(headers, 'application/json');
    return stringifySafely(data);
  }

  return data;
}

const beforeSendRquestInterceptor = {
  fulfilled(config: RequestConfig) {
    if (!config.headers) {
      config.headers = {};
    }
    if (config.responseType === 'json') {
      config.headers['Accept'] = 'application/json';
      config.headers['Content-Type'] = 'application/json';
    }
    config.data = transformRequest(config.data || {}, config.headers);
    return config;
  },
  rejected: () => {},
};

export class Client {
  public defaultOptions: RequetConstructor = {
    headers: {
      Accept: 'application/json, text/plain, */*',
    },
  };
  public interceptors: {
    request: InterceptorManager<RequestConfig>;
    response: InterceptorManager<ReqeustResponse>;
  };

  constructor(options: RequetConstructor) {
    Object.assign(this.defaultOptions, options);
    this.interceptors = {
      request: new InterceptorManager<RequestConfig>(),
      response: new InterceptorManager<ReqeustResponse>(),
    };

    this.interceptors.response.use(
      (response) => {
        if (response.config.responseType === 'json' && response.data) {
          response.data = JSON.parse(response.data);
        }
        return response;
      },
      (error) => {
        throw error;
      }
    );
  }

  async _request<D = any>(
    mergeConfig: RequestConfig
  ): Promise<ReqeustResponse<D>> {
    const {
      baseURL,
      method,
      url,
      responseType = 'json',
      params,
      data,
      headers,
      timeout,
    } = mergeConfig;
    const requestHeaders = { ...headers };
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const fullPath = buildFullPath(baseURL || '', url);
      const requestUrl = buildURL(fullPath, params);
      const protocol = parseProtocol(fullPath);
      if (timeout) {
        xhr.timeout = timeout;
      }

      if (
        protocol &&
        ['http', 'https', 'file', 'blob'].indexOf(protocol) === -1
      ) {
        reject(new Error('Unsupported protocol'));
        return;
      }

      xhr.open((method || 'get').toUpperCase(), requestUrl, true);

      function onloadend() {
        const { status, statusText, responseText, response } = xhr;
        const responseData =
          !responseType || responseType === 'text' || responseType === 'json'
            ? responseText
            : response;
        const reqeustResponse: ReqeustResponse = {
          status,
          statusText,
          headers: parseHeaders(xhr.getAllResponseHeaders()),
          config: mergeConfig,
          request: xhr,
          data: responseData,
        };
        resolve(reqeustResponse);
      }

      if ('onloadend' in xhr) {
        xhr.onloadend = onloadend;
      } else {
        xhr.onreadystatechange = function handleLoad() {
          if (!xhr || xhr.readyState !== 4) {
            return;
          }

          if (
            xhr.status === 0 &&
            !(xhr.responseURL && xhr.responseURL.indexOf('file:') === 0)
          ) {
            return;
          }
          setTimeout(onloadend);
        };
      }

      xhr.onerror = function onerror() {
        setTimeout(function () {
          reject(new Error('Network request failed'));
        }, 0);
      };
      xhr.ontimeout = function ontimeout() {
        setTimeout(function () {
          reject(new Error('Network request timeout'));
        }, 0);
      };

      xhr.onabort = function onabort() {
        setTimeout(function () {
          reject(new Error('Network request aborted'));
        }, 0);
      };

      if ('setRequestHeader' in xhr) {
        Object.entries(requestHeaders || {}).forEach(([key, header]) => {
          if (
            typeof data === 'undefined' &&
            key.toLowerCase() === 'content-type'
          ) {
            delete requestHeaders[key];
          } else {
            const headerContents = Array.isArray(header) ? header : [header];
            headerContents.forEach((v) => {
              xhr.setRequestHeader(key, String(v));
            });
          }
        });
      }

      // Add responseType to request if needed
      if (responseType && responseType !== 'json') {
        xhr.responseType = responseType;
      }

      xhr.send(data || (null as any));
    });
  }

  async request<D = any>(
    reqeustConfig: RequestConfig
  ): Promise<ReqeustResponse<D>> {
    // 拦截请求
    const berforeRequest = (config: RequestConfig) => {
      const handlers = [
        ...this.interceptors.request.handlers,
        beforeSendRquestInterceptor,
      ];
      return handlers.reduce((promise: Promise<RequestConfig>, handler) => {
        if (!handler) return promise;
        return promise.then(
          (config) => handler.fulfilled(config),
          (error) => handler.rejected(error)
        );
      }, Promise.resolve(config));
    };
    // 拦截响应
    const afterRequest = (promise: Promise<ReqeustResponse<D>>) => {
      return this.interceptors.response.handlers.reduce(
        (request: Promise<ReqeustResponse<D>>, handler) => {
          if (!handler) {
            return request;
          }
          return request.then(
            (response) => handler.fulfilled(response),
            (error) => handler.rejected(error)
          );
        },
        promise
      );
    };
    const mergeConfig = await berforeRequest(
      Object.assign({}, this.defaultOptions, reqeustConfig, {
        headers: {
          ...(this.defaultOptions.headers || {}),
          ...(reqeustConfig.headers || {}),
        },
      })
    );
    return afterRequest(this._request<D>(mergeConfig));
  }

  async _paramsRequest<D = any>(
    method: Method,
    url: string,
    params?: RequetParams,
    options?: ParamsRequestOptions
  ): Promise<ReqeustResponse<D>> {
    return this.request({
      ...(options || {}),
      method,
      url,
      params,
    });
  }

  async _dataRequest<D = any>(
    method: Method,
    url: string,
    data?: RequetParams,
    options?: DataRequestOptions
  ): Promise<ReqeustResponse<D>> {
    return this.request({
      ...(options || {}),
      method,
      url,
      data,
    });
  }

  async head<D = any>(
    url: string,
    params?: RequetParams,
    options?: ParamsRequestOptions
  ): Promise<ReqeustResponse<D>> {
    return this._paramsRequest<D>('HEAD', url, params, options);
  }

  async options<D = any>(
    url: string,
    params?: RequetParams,
    options?: ParamsRequestOptions
  ): Promise<ReqeustResponse<D>> {
    return this._paramsRequest<D>('HEAD', url, params, options);
  }

  async get<D = any>(
    url: string,
    params?: RequetParams,
    options?: ParamsRequestOptions
  ): Promise<ReqeustResponse<D>> {
    return this._paramsRequest<D>('GET', url, params, options);
  }

  async delete<D = any>(
    url: string,
    params?: RequetParams,
    options?: ParamsRequestOptions
  ): Promise<ReqeustResponse<D>> {
    return this._paramsRequest<D>('DELETE', url, params, options);
  }

  async post<D = any>(
    url: string,
    data?: RequetParams,
    options?: DataRequestOptions
  ): Promise<ReqeustResponse<D>> {
    return this._dataRequest('POST', url, data, options);
  }
  async put<D = any>(
    url: string,
    data?: RequetParams,
    options?: DataRequestOptions
  ): Promise<ReqeustResponse<D>> {
    return this._dataRequest('PUT', url, data, options);
  }

  async patch<D = any>(
    url: string,
    data?: RequetParams,
    options?: DataRequestOptions
  ): Promise<ReqeustResponse<D>> {
    return this._dataRequest('PATCH', url, data, options);
  }
}
