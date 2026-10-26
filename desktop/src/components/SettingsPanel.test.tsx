import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPanel } from './SettingsPanel';
import type { ToolkitAPI } from '../../shared/contracts';

vi.mock('./ThemeEditor', () => ({ ThemeEditor: () => <div>Temas</div> }));
afterEach(cleanup);
function setup() {
  const settings = { python: '', core: '', oda: '', envFile: '', gdal: '', glossary: '' };
  const api = { settings: async () => settings, saveSettings: vi.fn(async value => value),
    pick: vi.fn(async () => ['C:/chosen.env']), check: async () => [],
    googleStatus: async () => ({ configured: false, source: 'none' }),
    setGoogleKey: vi.fn(async () => ({ configured: true, source: 'session' })),
  } as unknown as ToolkitAPI;
  render(<SettingsPanel api={api} onError={vi.fn()} />);
  return api;
}
test('seção Google permite selecionar e salvar referência env explícita', async () => {
  const api = setup();
  await userEvent.click(await screen.findByRole('button', { name: 'Selecionar arquivo .env' }));
  expect((screen.getByLabelText('Arquivo .env') as HTMLInputElement).value).toBe('C:/chosen.env');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar arquivo .env' }));
  await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ envFile: 'C:/chosen.env' })));
});
test('chave é mascarada, limpa após enviar e não entra nas configurações persistidas', async () => {
  const api = setup();
  const input = await screen.findByLabelText('Chave Google Maps para esta sessão');
  expect(input.getAttribute('type')).toBe('password');
  await userEvent.type(input, 'synthetic-session-key');
  await userEvent.click(screen.getByRole('button', { name: 'Usar chave nesta sessão' }));
  await waitFor(() => expect(api.setGoogleKey).toHaveBeenCalledWith('synthetic-session-key'));
  expect((input as HTMLInputElement).value).toBe('');
  expect(api.saveSettings).not.toHaveBeenCalled();
  expect(screen.queryByDisplayValue('synthetic-session-key')).toBeNull();
});
