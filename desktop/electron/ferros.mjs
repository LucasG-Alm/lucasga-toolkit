// Progresso da leitura do AutoCAD: o Python imprime @@FERROS_PROGRESSO@@{json} no stdout (R-FER-UI-006).
const MARCA = '@@FERROS_PROGRESSO@@';
export function progressoFerros(linha) {
  if (!linha.startsWith(MARCA)) return null;
  try {
    const { fase, i, n } = JSON.parse(linha.slice(MARCA.length));
    return { fase, i, n };
  } catch { return null; }
}
