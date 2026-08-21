Option Strict On
Option Explicit On

Imports System.Collections.Generic
Imports Autodesk.AutoCAD.ApplicationServices
Imports Autodesk.AutoCAD.DatabaseServices
Imports Autodesk.AutoCAD.EditorInput
Imports Nucleo

Namespace Comandos.Pts3d

    Public Class ResultadoLeitura
        Public Property Pontos As New List(Of PontoCotado)()
        Public Property Descartados As Integer
        Public Property Cancelado As Boolean
    End Class

    ''' <summary>
    ''' Fronteira com o AutoCAD: converte a seleção do usuário em dados puros.
    ''' Aceita DBPoint e BlockReference; qualquer outro tipo é contado como
    ''' descartado e reportado.
    ''' </summary>
    Public Module LeitorDePontos

        Public Function Ler(doc As Document) As ResultadoLeitura
            Dim res As New ResultadoLeitura()
            Dim ed As Editor = doc.Editor

            Dim opcoes As New PromptSelectionOptions()
            opcoes.MessageForAdding = vbLf & "Selecione os pontos cotados"
            Dim sel As PromptSelectionResult = ed.GetSelection(opcoes)

            If sel.Status <> PromptStatus.OK Then
                res.Cancelado = True
                Return res
            End If

            Dim ordem As Integer = 0

            Using tr As Transaction = doc.Database.TransactionManager.StartTransaction()
                For Each id As ObjectId In sel.Value.GetObjectIds()
                    Dim ent As Entity = TryCast(tr.GetObject(id, OpenMode.ForRead), Entity)
                    If ent Is Nothing Then Continue For

                    Dim ponto As PontoCotado = Nothing
                    Dim dbp As DBPoint = TryCast(ent, DBPoint)

                    If dbp IsNot Nothing Then
                        ponto = New PontoCotado With {
                            .Handle = dbp.Handle.ToString(),
                            .X = dbp.Position.X, .Y = dbp.Position.Y, .Z = dbp.Position.Z,
                            .Layer = dbp.Layer
                        }
                    Else
                        Dim blk As BlockReference = TryCast(ent, BlockReference)
                        If blk IsNot Nothing Then
                            ponto = New PontoCotado With {
                                .Handle = blk.Handle.ToString(),
                                .X = blk.Position.X, .Y = blk.Position.Y, .Z = blk.Position.Z,
                                .Layer = blk.Layer
                            }
                            LerAtributos(tr, blk, ponto)
                        End If
                    End If

                    If ponto Is Nothing Then
                        res.Descartados += 1
                    Else
                        ponto.OrdemSelecao = ordem
                        ordem += 1
                        res.Pontos.Add(ponto)
                    End If
                Next
                tr.Commit()
            End Using

            Return res
        End Function

        ''' <summary>
        ''' Lê PONTO, DESC e COTA/Z dos atributos. Nomes de tag são comparados
        ''' sem diferenciar maiúsculas.
        ''' </summary>
        Private Sub LerAtributos(tr As Transaction, blk As BlockReference, ponto As PontoCotado)
            For Each attId As ObjectId In blk.AttributeCollection
                Dim att As AttributeReference = TryCast(tr.GetObject(attId, OpenMode.ForRead), AttributeReference)
                If att Is Nothing Then Continue For

                Select Case att.Tag.Trim().ToUpperInvariant()
                    Case "PONTO"
                        ponto.Numero = att.TextString
                    Case "DESC"
                        ponto.Descricao = att.TextString
                    Case "COTA", "Z"
                        Dim v As Double? = PontoCotado.LerCota(att.TextString)
                        If v.HasValue Then ponto.CotaAtributo = v
                End Select
            Next
        End Sub

    End Module

End Namespace
