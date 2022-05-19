import {
    buildFullPath,
    buildURL,
    parseHeaders,
    parseProtocol,
    stringifySafely,
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

export type RequetHeaders = Record<
    string,
    string | number | number[] | string[]
>;

export type ResponseType = XMLHttpRequestResponseType;

export interface RequetConstructor {
    baseURL?: string;
    headers?: RequetHeaders;
    timeout?: number;
    responseType?: ResponseType;
}

export type RequetParams = Record<string, any>;

export interface ReqeustConfig extends RequetConstructor {
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
    config: ReqeustConfig;
    request?: any;
}

export type ParamsRequestOptions = Omit<
    ReqeustConfig,
    'method' | 'url' | 'params' | 'data'
>;
export type DataRequestOptions = Omit<ReqeustConfig, 'method' | 'url' | 'data'>;

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

export default class CocosRequest {
    public defaultOptions: RequetConstructor = {};
    public interceptors: {
        request: InterceptorManager<ReqeustConfig>;
        response: InterceptorManager<ReqeustResponse>;
    };

    constructor(options: RequetConstructor) {
        Object.assign(this.defaultOptions, options);
        this.interceptors = {
            request: new InterceptorManager<ReqeustConfig>(),
            response: new InterceptorManager<ReqeustResponse>(),
        };
    }

    _berforeRequest(config: ReqeustConfig): Promise<ReqeustConfig> {
        return this.interceptors.request.handlers.reduce(
            (promise: Promise<ReqeustConfig>, handler) => {
                return promise.then((config) => {
                    if (handler) {
                        return Promise.resolve(handler.fulfilled(config))
                            .then((res) => res || config)
                            .catch((error) => handler.rejected(error));
                    }
                    return config;
                });
            },
            Promise.resolve(config)
        );
    }

    async request<D = any>(
        reqeustConfig: ReqeustConfig
    ): Promise<ReqeustResponse<D>> {
        // 请求拦截
        const mergeConfig = await this._berforeRequest(
            Object.assign({}, this.defaultOptions, reqeustConfig)
        );

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
        if (responseType === 'json') {
            requestHeaders['Accept'] = 'application/json';
            requestHeaders['Content-Type'] = 'application/json';
        }
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const fullPath = buildFullPath(baseURL || '', url);
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

            xhr.open(
                (method || 'get').toUpperCase(),
                buildURL(fullPath, params),
                true
            );

            const berforeResolve = (reqeustResponse: ReqeustResponse<D>) => {
                return this.interceptors.response.handlers.reduce(
                    (promise, handler) => {
                        return promise.then((config) => {
                            if (handler) {
                                return Promise.resolve(
                                    handler.fulfilled(config)
                                )
                                    .then((res) => res || config)
                                    .catch((error) => handler.rejected(error));
                            }
                            return config;
                        });
                    },
                    Promise.resolve(reqeustResponse)
                );
            };

            function onloadend() {
                const { status, statusText, responseText, response } = xhr;
                const responseData =
                    !responseType ||
                    responseType === 'text' ||
                    responseType === 'json'
                        ? responseText
                        : response;
                const reqeustResponse: ReqeustResponse = {
                    status,
                    statusText,
                    headers: parseHeaders(xhr.getAllResponseHeaders()),
                    config: reqeustConfig,
                    request: xhr,
                    data:
                        responseType === 'json'
                            ? JSON.parse(responseData)
                            : responseData,
                };
                berforeResolve(reqeustResponse).then((res) => resolve(res));
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
                        !(
                            xhr.responseURL &&
                            xhr.responseURL.indexOf('file:') === 0
                        )
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
                Object.entries(requestHeaders || {}).forEach(
                    ([key, header]) => {
                        if (
                            typeof data === 'undefined' &&
                            key.toLowerCase() === 'content-type'
                        ) {
                            delete requestHeaders[key];
                        } else {
                            const headerContents = Array.isArray(header)
                                ? header
                                : [header];
                            headerContents.forEach((v) => {
                                xhr.setRequestHeader(key, String(v));
                            });
                        }
                    }
                );
            }

            // Add responseType to request if needed
            if (responseType && responseType !== 'json') {
                xhr.responseType = responseType;
            }

            xhr.send(data ? stringifySafely(data) : null);
        });
    }

    async _paramsRequest<D = any>(
        method: Method,
        url: string,
        params: RequetParams,
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
        data: RequetParams,
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
        params: RequetParams,
        options?: ParamsRequestOptions
    ): Promise<ReqeustResponse<D>> {
        return this._paramsRequest<D>('HEAD', url, params, options);
    }

    async options<D = any>(
        url: string,
        params: RequetParams,
        options?: ParamsRequestOptions
    ): Promise<ReqeustResponse<D>> {
        return this._paramsRequest<D>('HEAD', url, params, options);
    }

    async get<D = any>(
        url: string,
        params: RequetParams,
        options?: ParamsRequestOptions
    ): Promise<ReqeustResponse<D>> {
        return this._paramsRequest<D>('GET', url, params, options);
    }

    async delete<D = any>(
        url: string,
        params: RequetParams,
        options?: ParamsRequestOptions
    ): Promise<ReqeustResponse<D>> {
        return this._paramsRequest<D>('DELETE', url, params, options);
    }

    async post<D = any>(
        url: string,
        data: RequetParams,
        options?: DataRequestOptions
    ): Promise<ReqeustResponse<D>> {
        return this._dataRequest('POST', url, data, options);
    }
    async put<D = any>(
        url: string,
        data: RequetParams,
        options?: DataRequestOptions
    ): Promise<ReqeustResponse<D>> {
        return this._dataRequest('PUT', url, data, options);
    }

    async patch<D = any>(
        url: string,
        data: RequetParams,
        options?: DataRequestOptions
    ): Promise<ReqeustResponse<D>> {
        return this._dataRequest('PATCH', url, data, options);
    }
}
