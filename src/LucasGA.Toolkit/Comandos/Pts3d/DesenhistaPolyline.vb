Option Strict On
Option Explicit On

Imports System.Collections.Generic
Imports System.Linq
Imports Autodesk.AutoCAD.ApplicationServices
Imports Autodesk.AutoCAD.DatabaseServices
Imports Autodesk.AutoCAD.Geometry
Imports Nucleo

Namespace Comandos.Pts3d

    ''' <summary>
    ''' Cria a Polyline3d. Tudo numa transação só, então um U desfaz inteiro.
    ''' </summary>
    Public Module DesenhistaPolyline

        ''' <summary>
        ''' Desenha a polilinha com os pontos marcados, na ordem recebida.
        ''' Devolve ObjectId.Null se houver menos de 2 pontos marcados.
        ''' nomeLayer vazio usa a layer corrente; layer inexistente é criada.
        ''' </summary>
        Public Function Desenhar(doc As Document,
                                 pontos As List(Of PontoCotado),
                                 nomeLayer As String) As ObjectId

            Dim usados As List(Of PontoCotado) = pontos.Where(Function(p) p.Marcado).ToList()
            If usados.Count < 2 Then Return ObjectId.Null

            Dim db As Database = doc.Database
            Dim idPolilinha As ObjectId = ObjectId.Null

            Using tr As Transaction = db.TransactionManager.StartTransaction()
                Dim bt As BlockTable = CType(tr.GetObject(db.BlockTableId, OpenMode.ForRead), BlockTable)
                Dim btr As BlockTableRecord = CType(tr.GetObject(bt(BlockTableRecord.ModelSpace), OpenMode.ForWrite), BlockTableRecord)

                Dim pl As New Polyline3d()
                If Not String.IsNullOrWhiteSpace(nomeLayer) Then
                    pl.Layer = GarantirLayer(tr, db, nomeLayer)
                End If

                btr.AppendEntity(pl)
                tr.AddNewlyCreatedDBObject(pl, True)

                For Each p As PontoCotado In usados
                    Dim v As New PolylineVertex3d(New Point3d(p.X, p.Y, p.Z))
                    pl.AppendVertex(v)
                    tr.AddNewlyCreatedDBObject(v, True)
                Next

                idPolilinha = pl.ObjectId
                tr.Commit()
            End Using

            Return idPolilinha
        End Function

        ''' <summary>Cria a layer se não existir. Devolve o nome para atribuição.</summary>
        Private Function GarantirLayer(tr As Transaction, db As Database, nome As String) As String
            Dim lt As LayerTable = CType(tr.GetObject(db.LayerTableId, OpenMode.ForRead), LayerTable)
            If lt.Has(nome) Then Return nome

            lt.UpgradeOpen()
            Dim ltr As New LayerTableRecord()
            ltr.Name = nome
            lt.Add(ltr)
            tr.AddNewlyCreatedDBObject(ltr, True)
            Return nome
        End Function

    End Module

End Namespace
