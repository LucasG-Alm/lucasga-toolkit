import React from 'react';
import {afterEach, expect, test, vi} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {ToolForm} from './ToolForm';
import type {Tool} from '../../shared/contracts';
afterEach(cleanup);
const tool:Tool={id:'cad-kmz',name:'KMZ',category:'CAD',description:'',extensions:['.dwg'],single:true,inspect:true,fields:[{key:'crsConfirmed',label:'CRS conferido',type:'checkbox',value:false,help:''}]};
test.each([
  [0,false,false,'Selecione um arquivo para começar.',true],
  [2,false,false,'Selecione um único arquivo.',true],
  [1,false,false,'Inspecione a entrada para continuar.',true],
  [1,true,false,'Confirme o sistema de coordenadas do desenho.',true],
  [1,true,true,'Tudo pronto para executar.',false],
] as const)('prontidão coerente: %s arquivos / inspeção %s / CRS %s', (count,inspectionReady,crsConfirmed,message,disabled)=>{
 render(<ToolForm tool={tool} values={{crsConfirmed}} count={count} busy={false} launching={false} inspectionReady={inspectionReady} inspecting={false} onChange={vi.fn()} onPickOutput={vi.fn()} onExecute={vi.fn()} onInspect={vi.fn()}/>);
 expect(screen.getByText(message)).toBeTruthy();
 expect((screen.getByRole('button',{name:/Executar/}) as HTMLButtonElement).disabled).toBe(disabled);
});
