// Local control-plane helper. Credentials remain in memory and are never logged.
import {cliCredential} from './weather-cloudbase-env.mjs';
export {cliCredential};
export async function cloudApi(service,version,action,body,credential,region='ap-shanghai'){
 process.env.DEBUG='';
 const {sign}=await import('@cloudbase/signature-nodejs');
 const host=`${service}.tencentcloudapi.com`,url=`https://${host}/`;
 const headers={'content-type':'application/json; charset=utf-8',host};
 const signature=sign({secretId:credential.secretId,secretKey:credential.secretKey,method:'POST',url,service,headers,params:body,isCloudApi:true});
 const response=await fetch(url,{method:'POST',headers:{...headers,Authorization:signature.authorization,'X-TC-Action':action,'X-TC-Version':version,'X-TC-Region':region,'X-TC-Timestamp':String(signature.timestamp),'X-TC-Token':credential.token},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const result=(await response.json()).Response;
 if(!response.ok||!result||result.Error)throw new Error(`${service.toUpperCase()}_${result?.Error?.Code||response.status}`);
 return result;
}
