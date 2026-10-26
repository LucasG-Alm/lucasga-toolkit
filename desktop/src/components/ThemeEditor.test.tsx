import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeEditor } from './ThemeEditor';
import { ThemeSwitch } from './ThemeSwitch';
import { applyTheme, readThemeId, getThemeColors } from '../lib/themes';

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); document.documentElement.removeAttribute('data-theme'); document.documentElement.removeAttribute('style'); });

test('prévia, cancelamento e salvamento mantêm editor e seletor sincronizados', async () => {
  applyTheme('criativo', true);
  const view = render(<><ThemeSwitch/><ThemeEditor/></>);
  const field = screen.getByLabelText('Principal (HEX)');
  await userEvent.clear(field); await userEvent.type(field, '#22C55E');
  expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#22C55E');
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar alterações' }));
  expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#F97316');
  await userEvent.clear(field); await userEvent.type(field, '#22C55E');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar tema' }));
  view.unmount();
  render(<><ThemeSwitch/><ThemeEditor/></>);
  expect(readThemeId()).toBe('criativo');
  expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#22C55E');
  expect(getThemeColors('sistemico').primary).toBe('#3B82F6');
  await userEvent.click(screen.getByRole('button', { name: 'Restaurar padrão' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar tema' }));
  expect(getThemeColors('criativo').primary).toBe('#F97316');
});

test('HEX inválido não entra no CSS nem pode ser salvo; prévia é descartada ao sair', async () => {
  applyTheme('sistemico', true);
  const view = render(<ThemeEditor/>);
  const field = screen.getByLabelText('Fundo (HEX)');
  await userEvent.clear(field); await userEvent.type(field, 'url(invalido)');
  expect(screen.getByRole('button', { name: 'Salvar tema' }).hasAttribute('disabled')).toBe(true);
  expect(document.documentElement.style.getPropertyValue('--background')).toBe('#0F172A');
  await userEvent.clear(field); await userEvent.type(field, '#112233');
  expect(document.documentElement.style.getPropertyValue('--background')).toBe('#112233');
  view.unmount();
  expect(document.documentElement.style.getPropertyValue('--background')).toBe('#0F172A');
});

test('troca pelo seletor lateral durante a edição carrega o tema escolhido', async () => {
  applyTheme('sistemico', true);
  render(<><ThemeSwitch/><ThemeEditor/></>);
  await userEvent.selectOptions(screen.getByLabelText('Tema'), 'iterativo');
  expect((screen.getByLabelText('Tema para editar') as HTMLSelectElement).value).toBe('iterativo');
  expect((screen.getByLabelText('Destaque (HEX)') as HTMLInputElement).value).toBe('#EC4899');
});

test('preferências antigas e personalizações corrompidas têm fallback seguro', () => {
  localStorage.setItem('lucasga-toolkit-theme', 'ambicioso');
  localStorage.setItem('lucasga-toolkit-theme-colors', '{quebrado');
  expect(readThemeId()).toBe('criativo');
  expect(getThemeColors('criativo').background).toBe('#181A1F');
  localStorage.setItem('lucasga-toolkit-theme-colors', JSON.stringify({ criativo: { primary: 'red', background: '#102030' } }));
  expect(getThemeColors('criativo').primary).toBe('#F97316');
  expect(getThemeColors('criativo').background).toBe('#102030');
});

test('avisa contraste baixo e não afirma salvamento se o armazenamento falhar', async () => {
  applyTheme('sistemico', true);
  render(<ThemeEditor/>);
  const field = screen.getByLabelText('Texto (HEX)');
  await userEvent.clear(field); await userEvent.type(field, '#172238');
  expect(screen.getByText(/Contraste baixo na prévia/)).toBeTruthy();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await userEvent.click(screen.getByRole('button', { name: 'Salvar tema' }));
  expect(screen.getByRole('alert').textContent).toContain('Não foi possível salvar');
  expect(screen.queryByText('Tema salvo neste computador.')).toBeNull();
});
