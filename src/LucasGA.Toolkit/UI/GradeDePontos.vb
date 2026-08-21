Option Strict On
Option Explicit On

Imports System.Collections.Generic
Imports System.Drawing
Imports System.Linq
Imports System.Windows.Forms
Imports Nucleo

Namespace UI

    ''' <summary>
    ''' DataGridView dos pontos. Reordenação por arraste, marcação por checkbox
    ''' e coloração por alerta.
    ''' </summary>
    Public Class GradeDePontos
        Inherits UserControl

        Private ReadOnly _grade As New DataGridView()
        Private _pontos As New List(Of PontoCotado)()
        Private _linhaArrastada As Integer = -1

        Public Event OrdemAlterada()

        Public Sub New()
            _grade.Dock = DockStyle.Fill
            _grade.AllowDrop = True
            _grade.AllowUserToAddRows = False
            _grade.AllowUserToDeleteRows = False
            _grade.RowHeadersVisible = False
            _grade.SelectionMode = DataGridViewSelectionMode.FullRowSelect
            _grade.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.AllCells

            _grade.Columns.Add(New DataGridViewCheckBoxColumn() With {.Name = "Marcado", .HeaderText = "", .Width = 30})
            For Each c In {"#", "PONTO", "DESC", "LAYER", "X", "Y", "Z", "COTA (attr)", "D"}
                _grade.Columns.Add(New DataGridViewTextBoxColumn() With {.Name = c, .HeaderText = c, .ReadOnly = True})
            Next

            AddHandler _grade.MouseDown, AddressOf AoPressionar
            AddHandler _grade.DragOver, AddressOf AoArrastarSobre
            AddHandler _grade.DragDrop, AddressOf AoSoltar
            AddHandler _grade.CellValueChanged, AddressOf AoMudarCelula

            Me.Controls.Add(_grade)
        End Sub

        Public Sub Carregar(pontos As List(Of PontoCotado))
            _pontos = pontos
            Redesenhar()
        End Sub

        ''' <summary>Pontos na ordem visível da grade — é o que será desenhado.</summary>
        Public Function PontosNaOrdemExibida() As List(Of PontoCotado)
            Return _pontos.ToList()
        End Function

        Private Sub Redesenhar()
            _grade.Rows.Clear()
            For i As Integer = 0 To _pontos.Count - 1
                Dim p As PontoCotado = _pontos(i)
                Dim delta As String = ""
                If p.CotaAtributo.HasValue Then delta = (p.Z - p.CotaAtributo.Value).ToString("F3")

                Dim idx As Integer = _grade.Rows.Add(
                    p.Marcado, (i + 1).ToString(), p.Numero, p.Descricao, p.Layer,
                    p.X.ToString("F3"), p.Y.ToString("F3"), p.Z.ToString("F3"),
                    If(p.CotaAtributo.HasValue, p.CotaAtributo.Value.ToString("F3"), ""),
                    delta)

                _grade.Rows(idx).DefaultCellStyle.BackColor = CorDoAlerta(p.Alertas)
            Next
        End Sub

        ''' <summary>Vermelho manda sobre laranja, que manda sobre amarelo.</summary>
        Private Shared Function CorDoAlerta(a As Alerta) As Color
            If (a And Alerta.DivergenciaCota) = Alerta.DivergenciaCota Then Return Color.FromArgb(255, 205, 205)
            If (a And Alerta.DuplicadoXY) = Alerta.DuplicadoXY Then Return Color.FromArgb(255, 228, 196)
            If (a And Alerta.ZSuspeito) = Alerta.ZSuspeito Then Return Color.FromArgb(255, 250, 190)
            If (a And Alerta.SaltoNaCadeia) = Alerta.SaltoNaCadeia Then Return Color.FromArgb(220, 235, 255)
            Return Color.White
        End Function

        Private Sub AoMudarCelula(sender As Object, e As DataGridViewCellEventArgs)
            If e.RowIndex < 0 OrElse e.RowIndex >= _pontos.Count Then Return
            If _grade.Columns(e.ColumnIndex).Name <> "Marcado" Then Return
            _pontos(e.RowIndex).Marcado = CBool(_grade.Rows(e.RowIndex).Cells("Marcado").Value)
        End Sub

        Private Sub AoPressionar(sender As Object, e As MouseEventArgs)
            Dim hit = _grade.HitTest(e.X, e.Y)
            _linhaArrastada = hit.RowIndex
            If _linhaArrastada >= 0 Then
                _grade.DoDragDrop(_grade.Rows(_linhaArrastada), DragDropEffects.Move)
            End If
        End Sub

        Private Sub AoArrastarSobre(sender As Object, e As DragEventArgs)
            e.Effect = DragDropEffects.Move
        End Sub

        Private Sub AoSoltar(sender As Object, e As DragEventArgs)
            Dim ponto As Point = _grade.PointToClient(New Point(e.X, e.Y))
            Dim destino As Integer = _grade.HitTest(ponto.X, ponto.Y).RowIndex
            If _linhaArrastada < 0 OrElse destino < 0 OrElse destino = _linhaArrastada Then Return

            Dim p As PontoCotado = _pontos(_linhaArrastada)
            _pontos.RemoveAt(_linhaArrastada)
            _pontos.Insert(destino, p)
            Redesenhar()
            RaiseEvent OrdemAlterada()
        End Sub

    End Class

End Namespace
