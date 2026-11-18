/** Local development (`npm start`) — talks to the .NET API from `dotnet run`. */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:5080',
  pollIntervalMs: 60_000,
};
