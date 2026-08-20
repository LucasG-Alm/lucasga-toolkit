# CLAUDE.md — LucasGA Toolkit

Contexto para retomar o projeto em sessões futuras.

---

## O que é

Toolkit de comandos VB.NET para AutoCAD 2027. Guarda-chuva para as automações de
CAD do Lucas, começando pelo `PTS3D` (pontos cotados → 3D Polyline → CSV Revit).

## Origem

Saiu da sessão de 2026-08-20 sobre o **Piscinão Cedrolândia** (contrato 520).
O problema real: a topografia veio como blocos de ponto cotado e uma superfície
Civil 3D inacessível (proxy). Gerar a Toposolid a partir dos pontos soltos
produziu terreno irregular. A conclusão foi que o Lucas precisa **desenhar as
linhas de quebra à mão** — e o gargalo virou desenhar 3D Polyline ponto a ponto.

## Ambiente verificado (2026-08-20)

| Item | Situação |
|------|----------|
| AutoCAD 2027 | ✅ `C:\Program Files\Autodesk\AutoCAD 2027\` |
| API target | ⚠️ **`.NETCoreApp v10.0`** — mudou em relação ao 2026 (era .NET 8) |
| .NET SDK | ❌ só **8.0.424** — falta o **SDK 10** |
| .NET runtime | ✅ 10.0.9 presente |
| `accoreconsole.exe` | ✅ `C:\Program Files\Autodesk\AutoCAD 2027\` — testes headless |
| ODA File Converter | ✅ 27.1.0 |
| Civil 3D | ⚠️ **só o Object Enabler 2027** — não é o Civil 3D completo |
| Revit | ✅ 2025 |

### Bloqueio atual
Falta o **.NET 10 SDK**. Sem ele não há `dotnet build` contra `AcDbMgd.dll`.
Gratuito, sem Visual Studio.

⚠️ Atenção: o projeto **Elevar Paredes** foi planejado para .NET 8 / AutoCAD
2026. Com a subida para o 2027, aquele alvo ficou defasado.

## Decisões herdadas do Elevar Paredes

Ver `Projetos/Programação/Elevar Paredes/CLAUDE.md` no vault.

- **VB.NET, não C#** — familiaridade com VBA pesa mais que vantagens marginais
- **`dotnet` CLI, sem Visual Studio**
- **Princípio: avisar, nunca adivinhar** — diante de desenho ambíguo, reclamar.
  Um resultado errado que *parece* certo é pior que um aviso.

## Análise de DWG nesta máquina

DWG é binário. O fluxo que funciona:

```bash
"C:/Program Files/ODA/ODAFileConverter 27.1.0/ODAFileConverter.exe" \
  "<pasta_entrada>" "<pasta_saida>" "ACAD2018" "DXF" "0" "1"
```

Depois parsear o DXF com `ezdxf` (instalado, 1.4.4).

Truque útil descoberto na sessão de origem: objetos Civil 3D salvos sem o
aplicativo viram `ACAD_PROXY_ENTITY`, mas `ezdxf.proxygraphic.ProxyGraphic`
consegue decodificar a representação gráfica — foi assim que 179 curvas de nível
foram recuperadas de uma superfície inacessível.

## Restrições

- **Repositório público** — nenhum DWG, DXF, CSV ou dado de contrato pode ser
  commitado. O `.gitignore` bloqueia por extensão; arquivos de teste vão em
  `local/`.
