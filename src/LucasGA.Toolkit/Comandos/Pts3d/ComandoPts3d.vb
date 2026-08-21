Option Strict On
Option Explicit On

Imports Autodesk.AutoCAD.ApplicationServices
Imports Autodesk.AutoCAD.ApplicationServices.Core
Imports Autodesk.AutoCAD.Runtime

Namespace Comandos.Pts3d

    Public Class ComandoPts3d

        <CommandMethod("PTS3D")>
        Public Sub Pts3d()
            Dim doc As Document = Core.Application.DocumentManager.MdiActiveDocument
            If doc Is Nothing Then Return
            doc.Editor.WriteMessage(vbLf & "PTS3D carregado." & vbLf)
        End Sub

    End Class

End Namespace
