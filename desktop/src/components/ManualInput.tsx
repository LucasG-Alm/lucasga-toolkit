import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ToolkitAPI } from '../../shared/contracts';
export function ManualInput({ api, disabled, onPath, onError }: {
  api: ToolkitAPI; disabled: boolean; onPath(path: string): Promise<void>; onError(error: unknown): void;
}) {
  const [text, setText] = useState('');
  async function useData() {
    try { const file = await api.manualInput(text); await onPath(file); setText(''); }
    catch (error) { onError(error); }
  }
  return <details className="manual-input"><summary>Digitar ou colar dados</summary>
    <p className="helper mt-3 mb-2">Cole CSV com cabeçalho. Exemplo de coordenadas: x;y. Para endereços, use uma coluna endereco.</p>
    <textarea className="native-textarea" aria-label="Dados CSV" value={text} onChange={event => setText(event.target.value)}
      placeholder={'x;y\n-45;-23'} rows={5} disabled={disabled} />
    <Button className="mt-2" variant="outline" size="sm" disabled={disabled || !text.trim()} onClick={() => void useData()}>Usar dados digitados</Button>
  </details>;
}
