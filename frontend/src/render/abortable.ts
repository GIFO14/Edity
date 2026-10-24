/** Release render work immediately when a newer seek/transport state wins. */
export function abortable<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>{cleanup();reject(new Error('Superseded seek'));};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    // Always observe work, including work that finishes after cancellation.
    work.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
    if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  });
}
