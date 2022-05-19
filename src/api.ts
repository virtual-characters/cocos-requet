import { Client } from './client';
import type { RequetHeaders, RequestConfig, ReqeustResponse, ResponseType } from './client';

type RequestError = any;
/** 去除可索引签名 */
type RemoveIndexSignature<Obj extends Record<string, any>> = {
  [Key in keyof Obj as Key extends `${infer Str}` ? Str : never]: Obj[Key];
};

// 路径配置
export type RequestPath = `${Uppercase<RequestOptions['method']>} ${string}`;

// 选项配置
export type RequestOptions = {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'CONNECT' | 'TRACE' | 'PATCH';
  headers?: RequetHeaders;
};

// 自定义函数
export type RequestFunction<P = Record<string, any> | void, R = any> = (
  params: P,
  ...args: any[]
) => Promise<R>;

export type APIConfig = RequestPath | RequestOptions | RequestFunction;

export type RequestHandler = (config?: RequestConfig) => RequestConfig | Promise<RequestConfig>;
export type ResponseHandler = (
  response?: ReqeustResponse
) => ReqeustResponse | Promise<ReqeustResponse>;
export type RequestErrorHandler = (error: RequestError) => void;

export type APISchema = Record<
  string,
  {
    request: Record<string, any> | void;
    response: Record<string, any> | any;
  }
>;

export type CreateRequestConfig<T extends APISchema> = {
  baseURL: string;
  headers?: RequetHeaders;
  requestHandlers?: Array<RequestHandler>;
  responseHandlers?: Array<ResponseHandler>;
  timeout?: number;
  responseType?: ResponseType;
  errorHandler?: RequestErrorHandler;
  apis: {
    [K in keyof RemoveIndexSignature<T>]: APIConfig;
  };
};

// 创建请求客户端的类型约束
export type CreateRequestClient<T extends APISchema> = {
  [K in keyof RemoveIndexSignature<T>]: RequestFunction<
    RemoveIndexSignature<T>[K]['request'],
    ReqeustResponse<RemoveIndexSignature<T>[K]['response']>
  >;
};

const MATCH_METHOD = /^(GET|POST|PUT|DELETE|HEAD|OPTIONS|CONNECT|TRACE|PATCH)\s+/;
const MATCH_PATH_PARAMS = /:(\w+)/g;
const USE_DATA_METHODS = ['POST', 'PUT', 'PATCH'];

function attachAPI<T extends APISchema>(
  client: Client,
  apis: CreateRequestConfig<T>['apis']
): CreateRequestClient<T> {
  const hostApi: CreateRequestClient<T> = Object.create(null);
  for (const apiName in apis) {
    const apiConfig = apis[apiName];
    // 配置为一个函数
    if (typeof apiConfig === 'function') {
      hostApi[apiName] = apiConfig as RequestFunction;
      continue;
    }
    let apiOptions = {};
    let apiPath = apiConfig as RequestPath;
    // 配置为一个对象
    if (typeof apiConfig === 'object') {
      const { path, ...rest } = apiConfig as RequestOptions;
      apiPath = path as RequestPath;
      apiOptions = rest;
    }
    hostApi[apiName] = (params, options) => {
      const _params = { ...(params || {}) };
      // 匹配路径中请求方法，如：'POST /api/test'
      const [prefix, method] = apiPath.match(MATCH_METHOD) || ['GET ', 'GET'];
      // 剔除掉 ”POST “ 前缀
      let url = apiPath.replace(prefix, '');
      // 匹配路径中的参数占位符， 如 '/api/:user_id/:res_id'
      const matchParams = apiPath.match(MATCH_PATH_PARAMS);
      if (matchParams) {
        matchParams.forEach((match) => {
          const key = match.replace(':', '');
          if (Reflect.has(_params, key)) {
            url = url.replace(match, Reflect.get(_params, key));
            Reflect.deleteProperty(_params, key);
          }
        });
      }
      const requestParams = USE_DATA_METHODS.includes(method)
        ? { data: _params }
        : { params: _params };
      return client.request({
        url,
        method: method.toLowerCase(),
        ...requestParams,
        ...apiOptions,
        ...options,
      });
    };
  }
  return hostApi;
}

// 创建请求客户端
export function createRequestClient<T extends APISchema>(
  requestConfig: CreateRequestConfig<T>
): CreateRequestClient<T> {
  const client = new Client({
    baseURL: requestConfig.baseURL,
    headers: requestConfig.headers,
    timeout: requestConfig.timeout,
    responseType: requestConfig.responseType,
  });

  // 附加各业务请求头
  requestConfig.requestHandlers?.forEach((requestHandler) => {
    client.interceptors.request.use(requestHandler);
  });

  // 拦截请求
  requestConfig.responseHandlers?.forEach((responseHandler) => {
    client.interceptors.response.use(
      (response) => {
        return responseHandler(response);
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  });
  // 错误处理
  client.interceptors.response.use(
    (res) => res,
    (error: RequestError) => {
      const requestError = requestConfig.errorHandler ? requestConfig.errorHandler(error) : error;
      return Promise.reject(requestError);
    }
  );

  return attachAPI<T>(client, requestConfig.apis);
}
