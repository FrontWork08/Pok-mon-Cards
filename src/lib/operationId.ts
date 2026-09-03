export function createOperationId(){
  const cryptoObj=(globalThis as any)?.crypto;
  if(typeof cryptoObj?.randomUUID==='function')return String(cryptoObj.randomUUID());
  const hex='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return hex.replace(/[xy]/g,(char)=>{
    const value=Math.floor(Math.random()*16);
    const digit=char==='x'?value:(value&0x3)|0x8;
    return digit.toString(16);
  });
}
