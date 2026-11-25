import { streamProbe } from '../utils/stream-probe'

export default defineAction({
  handler: async () => ({ ...streamProbe }),
})
