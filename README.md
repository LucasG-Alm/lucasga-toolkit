# LucasGA Toolkit

Conjunto de comandos **VB.NET para AutoCAD** voltados a trabalho de engenharia
civil — topografia, terraplenagem e documentação de projeto.

Nasce de uma dor concreta: converter levantamento topográfico em geometria que o
Revit entenda, sem redesenhar ponto a ponto.

> Status: em desenvolvimento. Nenhum comando publicado ainda.

---

## Comandos

| Comando | O que faz | Status |
|---------|-----------|--------|
| `PTS3D` | Seleciona pontos cotados (POINT ou blocos com atributos), lista em tabela ordenável e desenha uma 3D Polyline na ordem escolhida. Exporta CSV para o Revit. | em construção |

---

## Requisitos

| Item | Versão |
|------|--------|
| AutoCAD | 2027 (API `.NETCoreApp v10.0`) |
| .NET SDK | 10.0 — necessário para **compilar** |
| Visual Studio | não é necessário |

O AutoCAD 2027 mudou o alvo da API para .NET 10. Compilar com o SDK 8 **não
funciona** — a DLL carrega e falha em runtime.

## Build

```bash
dotnet build src/LucasGA.Toolkit -c Release
```

No AutoCAD, carregue com `NETLOAD` apontando para a DLL gerada em
`src/LucasGA.Toolkit/bin/Release/`.

---

## Por que VB.NET

A API .NET do AutoCAD é idêntica em VB e C#. VB foi escolhido por continuidade
com o repertório de VBA — a barreira de leitura pesa mais que qualquer vantagem
marginal do C#.

---

## Aviso sobre dados

Este repositório é público e **não contém nenhum arquivo de projeto real**.
O `.gitignore` bloqueia DWG, DXF, CSV, XLSX e PDF por padrão. Arquivos de teste
ficam em `local/`, fora do controle de versão.

## Licença

MIT
