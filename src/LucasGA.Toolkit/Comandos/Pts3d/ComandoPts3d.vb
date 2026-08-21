Option Strict On
Option Explicit On

Imports Autodesk.AutoCAD.ApplicationServices
Imports Autodesk.AutoCAD.Runtime
Imports Nucleo

Namespace Comandos.Pts3d

    Public Class ComandoPts3d

        <CommandMethod("PTS3D")>
        Public Sub Pts3d()
            Dim doc As Document = Application.DocumentManager.MdiActiveDocument
            If doc Is Nothing Then Return

            Dim res As ResultadoLeitura = LeitorDePontos.Ler(doc)
            If res.Cancelado Then Return

            If res.Pontos.Count = 0 Then
                doc.Editor.WriteMessage(String.Format(
                    vbLf & "Nenhum ponto válido. {0} objeto(s) descartado(s). Aceito: POINT e blocos." & vbLf,
                    res.Descartados))
                Return
            End If

            Dim faixa = AnalisadorDeAlertas.CalcularFaixaPlausivel(res.Pontos)
            Dim comAlerta As Integer = AnalisadorDeAlertas.Analisar(res.Pontos, faixa)

            Dim ordenados = Ordenador.Ordenar(res.Pontos, ModoOrdenacao.OrdemSelecao)

            doc.Editor.WriteMessage(String.Format(
                vbLf & "{0} ponto(s). {1} com alerta. {2} descartado(s)." & vbLf,
                ordenados.Count, comAlerta, res.Descartados))

            PaletaPts3d.Mostrar(doc, ordenados)
        End Sub

    End Class

End Namespace
