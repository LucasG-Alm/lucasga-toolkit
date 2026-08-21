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

            If res.Cancelado Then
                doc.Editor.WriteMessage(vbLf & "Cancelado." & vbLf)
                Return
            End If

            doc.Editor.WriteMessage(String.Format(vbLf & "{0} ponto(s) lido(s), {1} descartado(s)." & vbLf,
                                                  res.Pontos.Count, res.Descartados))
        End Sub

    End Class

End Namespace
