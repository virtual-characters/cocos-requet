import { Client } from './src/client';
import { createRequestClient } from './src/api';
import type { APISchema } from './src/api';

interface TestAPISchema extends APISchema {
  getUser: {
    request: {
      id: number;
    };
    response: {
      avatar: string;
      id: number;
      name: string;
    };
  };

  createUser: {
    request: {
      avatar: string;
      name: string;
    };
    response: {
      avatar: string;
      id: number;
      name: string;
    };
  };
}

(async function () {
  const api = createRequestClient<TestAPISchema>({
    baseURL: 'http://localhost:3000',
    apis: {
      getUser: 'GET api/user/:id',
      createUser: 'POST api/user',
    },
    // responseType: 'json',
    requestHandlers: [
      (config) => {
        console.log('request', config);
        config.headers.token = '123';
        return config;
      },
      (config) => {
        console.log('request', config);
        config.headers.name = '123';
        return config;
      },
    ],
    responseHandlers: [
      (response) => {
        console.log('response', response);
        return response;
      },
    ],
    errorHandler: (error) => {
      console.log('error', error);
    },
  });

  const data1 = await api.getUser({ id: 1 });
  const data2 = await api.createUser({ name: 'xx', avatar: '1' });
  console.log({ data1, data2 });
})();
