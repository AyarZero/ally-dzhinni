import { codexLive } from './codex-live.mjs'
import { subscriptionEnv } from './local-executor-probes.mjs'

// Native compaction of an existing thread. Never starts/forks a thread or sends a prompt.
export function codexCompact({ cwd, threadId, rpcFactory = codexLive, timeoutMs = 180000 }) {
  if (!threadId) return Promise.reject(new Error('Нет текущей сессии Codex'))
  return new Promise((resolve, reject) => {
    let rpc, terminal=false, requested=false
    const timer=setTimeout(() => finish(new Error('Исход сжатия неизвестен: нет подтверждения Codex')),timeoutMs)
    function finish(error) {
      if(terminal) return
      terminal=true; clearTimeout(timer)
      if(error) {
        // An unconfirmed operation must not keep running in the shared server while
        // the next ordinary turn resumes this same thread.
        const child=rpc?.child
        if(child && child.exitCode==null && child.signalCode==null && rpc.dispose) {
          child.once('exit',()=>reject(error))
          rpc.dispose()
        } else { (rpc?.dispose || rpc?.close)?.call(rpc); reject(error) }
      } else { rpc?.close(); resolve({threadId,state:'completed'}) }
    }
    try {
      rpc=rpcFactory({cwd,env:subscriptionEnv(),onFailure:finish,onNotification:({method,params={}}) => {
        if(!requested || params.threadId!==threadId) return
        if(method==='item/completed' && params.item?.type==='contextCompaction') finish()
        if(method==='thread/compacted') finish()
        if(method==='error' && !params.willRetry) finish(new Error(params.error?.message || 'Сжатие Codex не подтверждено'))
      }})
      void (async () => {
        const resumed=await rpc.request('thread/resume',{threadId,cwd,approvalPolicy:'never',sandbox:'danger-full-access'})
        if(resumed.thread?.id!==threadId) throw new Error('Codex вернул другую сессию; сжатие не запущено')
        requested=true
        await rpc.request('thread/compact/start',{threadId})
        // RPC acknowledgement is not completion; wait for the contextCompaction item.
      })().catch(finish)
    } catch(error) { finish(error) }
  })
}
