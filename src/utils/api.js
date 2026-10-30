import { HOURS } from './model.js'
export const fetchServers = (client, signal) => client.send('/api/servers', { signal })
export const fetchServer = (client, id, signal) => client.send(`/api/server?id=${encodeURIComponent(id)}`, { signal })
export const fetchHistory = (client, id, hours, signal) => {
  if (!HOURS.includes(Number(hours))) throw new Error('Unsupported history range')
  return client.send(`/api/history/all?id=${encodeURIComponent(id)}&hours=${hours}`, { signal })
}
export const saveOptions = (client, options) => client.send('/api/theme_options', { body: { theme_options: options } })
