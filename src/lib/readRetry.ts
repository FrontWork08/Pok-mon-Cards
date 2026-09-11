const DEFAULT_DELAYS=[250,700] as const;

function retryable(error:unknown){
 const raw=String((error as any)?.message??error??'').toLowerCase();
 const status=Number((error as any)?.status??(error as any)?.statusCode??0);
 return status===0||status===408||status===429||status>=500||raw.includes('network')||raw.includes('fetch')||raw.includes('timeout')||raw.includes('temporar');
}

export async function withReadRetry<T>(operation:()=>Promise<T>,delays:readonly number[]=DEFAULT_DELAYS):Promise<T>{
 let last:unknown;
 for(let attempt=0;attempt<=delays.length;attempt++){
  try{return await operation();}catch(error){last=error;if(attempt===delays.length||!retryable(error))throw error;await new Promise(resolve=>setTimeout(resolve,delays[attempt]));}
 }
 throw last;
}
