// This subset is the vocabulary emitted by our Pydantic data contracts.
// Using those contracts here keeps browser and service validation aligned.
type Schema=Record<string,any>;
export function validateSchema(value:unknown,schema:Schema,root=schema,path='document'):void {
  if(schema.$ref){const target=schema.$ref.slice(2).split('/').reduce((s:Schema,key:string)=>s[key],root);return validateSchema(value,target,root,path);}
  if(schema.anyOf){for(const option of schema.anyOf){try{validateSchema(value,option,root,path);return;}catch{}}throw new Error(`Invalid ${path}`);}
  if(schema.const!==undefined&&value!==schema.const)throw new Error(`Unsupported ${path}: ${String(value)}`);
  if(schema.enum&&!schema.enum.includes(value))throw new Error(`Invalid ${path}`);
  const fail=()=>{throw new Error(`Invalid ${path}`);};
  switch(schema.type){
    case 'null':if(value!==null)fail();break;
    case 'boolean':if(typeof value!=='boolean')fail();break;
    case 'string':if(typeof value!=='string')fail();else if(schema.minLength!==undefined&&value.length<schema.minLength||schema.maxLength!==undefined&&value.length>schema.maxLength||schema.pattern&&!new RegExp(schema.pattern).test(value))fail();break;
    case 'integer':case 'number':if(schema.type==='integer'&&!Number.isSafeInteger(value))fail();if(typeof value!=='number'||!Number.isFinite(value))fail();else if(schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum||schema.exclusiveMinimum!==undefined&&value<=schema.exclusiveMinimum||schema.exclusiveMaximum!==undefined&&value>=schema.exclusiveMaximum)fail();break;
    case 'array':if(!Array.isArray(value))fail();else{if(schema.minItems!==undefined&&value.length<schema.minItems||schema.maxItems!==undefined&&value.length>schema.maxItems)fail();value.forEach((v,i)=>validateSchema(v,schema.items,root,`${path}[${i}]`));}break;
    case 'object':if(!value||typeof value!=='object'||Array.isArray(value))fail();else{
      const object=value as Record<string,unknown>;for(const key of schema.required||[])if(object[key]===undefined)throw new Error(`Missing ${path}.${key}`);
      for(const [key,v] of Object.entries(object)){if(v===undefined)continue;if(['__proto__','constructor','prototype'].includes(key))fail();const child=schema.properties?.[key];if(child)validateSchema(v,child,root,`${path}.${key}`);else if(schema.additionalProperties===false)throw new Error(`Unknown ${path}.${key}`);else if(typeof schema.additionalProperties==='object')validateSchema(v,schema.additionalProperties,root,`${path}.${key}`);}
    }break;
  }
}
