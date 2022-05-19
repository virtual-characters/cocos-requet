import Client from './src';

(async function () {
  const client = new Client({
    baseURL: 'http://localhost:3000',
    timeout: 1000,
    responseType: 'json',
  });
  client.interceptors.request.use((config) => {
    config.headers['x-name'] = 'x-name';
    return config;
  });
  client.interceptors.response.use(
    (response) => {
      console.log(response);
      return response;
    },
    (error) => {
      console.log(error);
    }
  );
  const res = await client.post('/api/users', { name: 'fuck' }, { headers: { lll: 'xx' } });
  console.log(res);
})();
