import {useId,type TextareaHTMLAttributes} from 'react';
export function TextAreaField({label,id,...props}:TextareaHTMLAttributes<HTMLTextAreaElement>&{label:string}){
  const generated=useId(),fieldId=id||generated;
  return <div className="form-field"><label htmlFor={fieldId}>{label}</label><textarea {...props} id={fieldId}/></div>;
}
