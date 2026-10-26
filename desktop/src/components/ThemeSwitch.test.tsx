import React from 'react';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSwitch } from './ThemeSwitch';
import { themes, themeTokens, contrast, readThemeId } from '../lib/themes';

afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.removeAttribute('data-theme'); document.documentElement.removeAttribute('style'); });

test('seletor aplica a identidade e restaura a preferência ao reabrir', async () => {
  const view = render(<ThemeSwitch />);
  await userEvent.selectOptions(screen.getByLabelText('Tema'), 'iterativo');
  expect(document.documentElement.dataset.theme).toBe('iterativo');
  expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#8B5CF6');
  view.unmount();
  render(<ThemeSwitch />);
  expect((screen.getByLabelText('Tema') as HTMLSelectElement).value).toBe('iterativo');
  expect(document.documentElement.dataset.theme).toBe('iterativo');
});

test('preferência desconhecida volta para Sistêmico sem bloquear o app', () => {
  localStorage.setItem('lucasga-toolkit-theme', 'inexistente');
  expect(readThemeId()).toBe('sistemico');
});

test('cálculo de contraste distingue preto/branco e cores iguais', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
  expect(contrast('#ffffff', '#ffffff')).toBe(1);
});

test.each(['sistemico', 'criativo', 'iterativo'])('%s mantém texto legível e as cores de identidade', id => {
  const theme = themes.find(item => item.id === id)!;
  const tokens = themeTokens(id);
  expect(tokens['--primary']).toBe(theme.primary);
  expect(tokens['--highlight']).toBe(theme.highlight);
  expect(tokens['--theme-base']).toBe(theme.base);
  expect(tokens['--theme-support']).toBe(theme.support);
  expect(contrast(tokens['--primary'], tokens['--primary-foreground'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokens['--card'], tokens['--foreground'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokens['--card'], tokens['--muted-foreground'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokens['--surface'], tokens['--muted-foreground'])).toBeGreaterThanOrEqual(4.5);
});

test('catálogo oferece somente os três temas aprovados com os fundos da prévia', () => {
  render(<ThemeSwitch />);
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Sistêmico', 'Criativo', 'Iterativo']);
  expect(themeTokens('sistemico')['--background']).toBe('#0F172A');
  expect(themeTokens('criativo')['--background']).toBe('#181A1F');
  expect(themeTokens('iterativo')['--background']).toBe('#120D1C');
});
