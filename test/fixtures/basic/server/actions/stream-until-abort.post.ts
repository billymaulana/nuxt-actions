import { streamProbe } from '../utils/stream-probe'

export default defineStreamAction({
  handler: async ({ stream }) => {
    streamProbe.started++
    while (!stream.signal.aborted) {
      await stream.send({ tick: streamProbe.started })
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    streamProbe.aborted++
  },
})
