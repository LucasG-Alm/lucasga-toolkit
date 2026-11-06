import {Button, type ButtonProps} from './ui/button';
import type {ReactNode} from 'react';
import {Card} from './ui/card';

/** Composições visuais de Ferros; cores herdadas dos tokens do tema. */
export function FerrosSection({step,title,children,className=''}:{step?:number;title:string;children:ReactNode;className?:string}) {
  return <Card className={`ferros-section ${className}`}><h2 className="ferros-section-title">{step && <span>{step}</span>}{title}</h2>{children}</Card>;
}
export function FerrosEmpty(){
  return <div className="ferros-empty-state"><span className="ferros-empty-symbol" aria-hidden="true">≡</span><strong>Nenhuma tag lida ainda</strong><p>As tags aparecem aqui para revisão. Campos faltando ficam destacados e a lista de ferros é calculada pelo aplicativo.</p></div>;
}

export function FerrosAction({label,text,icon,...props}:ButtonProps & {label:string;text?:string;icon:ReactNode}) {
 return <Button {...props} className="ferros-action" title={label} aria-label={label}>{icon}<span>{text || label}</span></Button>;
}
