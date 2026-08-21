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
        Private _colunaOrdenacao As String = String.Empty
        Private _ordemCrescente As Boolean = True

        Public Event OrdemAlterada()

        Public Sub New()
            _grade.Dock = DockStyle.Fill
            _grade.AllowDrop = True
            _grade.AllowUserToAddRows = False
            _grade.AllowUserToDeleteRows = False
            _grade.RowHeadersVisible = False
            _grade.SelectionMode = DataGridViewSelectionMode.FullRowSelect
            _grade.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.AllCells

            Dim colMarcado As New DataGridViewCheckBoxColumn() With {.Name = "Marcado", .HeaderText = "", .Width = 30}
            colMarcado.SortMode = DataGridViewColumnSortMode.NotSortable
            _grade.Columns.Add(colMarcado)

            For Each c In {"#", "PONTO", "DESC", "LAYER", "X", "Y", "Z", "COTA (attr)", "D"}
                Dim col As New DataGridViewTextBoxColumn() With {.Name = c, .HeaderText = c, .ReadOnly = True}
                ' Sort automático do DataGridView reordena só as linhas visíveis e não
                ' toca em _pontos — isso corrompe a correspondência linha↔ponto usada
                ' por AoMudarCelula e AoSoltar. A ordenação real é manual, via
                ' AoClicarCabecalho, que ordena o modelo e redesenha.
                col.SortMode = DataGridViewColumnSortMode.NotSortable
                _grade.Columns.Add(col)
            Next

            AddHandler _grade.MouseDown, AddressOf AoPressionar
            AddHandler _grade.DragOver, AddressOf AoArrastarSobre
            AddHandler _grade.DragDrop, AddressOf AoSoltar
            AddHandler _grade.CellValueChanged, AddressOf AoMudarCelula
            AddHandler _grade.CurrentCellDirtyStateChanged, AddressOf AoSujarCelula
            AddHandler _grade.ColumnHeaderMouseClick, AddressOf AoClicarCabecalho

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

        ''' <summary>
        ''' Confirma a edição do checkbox no próprio clique. Sem isso, CellValueChanged
        ''' só dispara quando a célula perde o foco, e o modelo fica temporariamente
        ''' dessincronizado da tela.
        ''' </summary>
        Private Sub AoSujarCelula(sender As Object, e As EventArgs)
            If _grade.IsCurrentCellDirty Then
                _grade.CommitEdit(DataGridViewDataErrorContexts.Commit)
            End If
        End Sub

        Private Sub AoPressionar(sender As Object, e As MouseEventArgs)
            Dim hit = _grade.HitTest(e.X, e.Y)

            ' Clique na coluna de checkbox não inicia arraste: DoDragDrop bloqueia o
            ' loop de mensagens do mouse e o MouseUp que alternaria o checkbox nunca
            ' chegaria ao tratamento interno do DataGridView.
            If hit.ColumnIndex >= 0 AndAlso _grade.Columns(hit.ColumnIndex).Name = "Marcado" Then Return

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

        ''' <summary>
        ''' Ordena o modelo (_pontos) pela coluna clicada, alternando crescente/decrescente
        ''' a cada clique repetido na mesma coluna. "#" e "Marcado" não ordenam.
        ''' </summary>
        Private Sub AoClicarCabecalho(sender As Object, e As DataGridViewCellMouseEventArgs)
            If e.RowIndex <> -1 OrElse e.ColumnIndex < 0 Then Return

            Dim nome As String = _grade.Columns(e.ColumnIndex).Name
            If nome = "#" OrElse nome = "Marcado" Then Return

            If _colunaOrdenacao = nome Then
                _ordemCrescente = Not _ordemCrescente
            Else
                _colunaOrdenacao = nome
                _ordemCrescente = True
            End If

            OrdenarPontos(nome, _ordemCrescente)
            Redesenhar()
            RaiseEvent OrdemAlterada()
        End Sub

        Private Sub OrdenarPontos(coluna As String, crescente As Boolean)
            Dim ordenado As IEnumerable(Of PontoCotado)

            Select Case coluna
                Case "PONTO"
                    ordenado = If(crescente,
                        _pontos.OrderBy(Function(p) p.Numero, StringComparer.OrdinalIgnoreCase),
                        _pontos.OrderByDescending(Function(p) p.Numero, StringComparer.OrdinalIgnoreCase))
                Case "DESC"
                    ordenado = If(crescente,
                        _pontos.OrderBy(Function(p) p.Descricao, StringComparer.OrdinalIgnoreCase),
                        _pontos.OrderByDescending(Function(p) p.Descricao, StringComparer.OrdinalIgnoreCase))
                Case "LAYER"
                    ordenado = If(crescente,
                        _pontos.OrderBy(Function(p) p.Layer, StringComparer.OrdinalIgnoreCase),
                        _pontos.OrderByDescending(Function(p) p.Layer, StringComparer.OrdinalIgnoreCase))
                Case "X"
                    ordenado = If(crescente, _pontos.OrderBy(Function(p) p.X), _pontos.OrderByDescending(Function(p) p.X))
                Case "Y"
                    ordenado = If(crescente, _pontos.OrderBy(Function(p) p.Y), _pontos.OrderByDescending(Function(p) p.Y))
                Case "Z"
                    ordenado = If(crescente, _pontos.OrderBy(Function(p) p.Z), _pontos.OrderByDescending(Function(p) p.Z))
                Case "COTA (attr)"
                    ordenado = OrdenarPorNulavel(_pontos, Function(p) p.CotaAtributo, crescente)
                Case "D"
                    ordenado = OrdenarPorNulavel(_pontos, AddressOf Delta, crescente)
                Case Else
                    Return
            End Select

            _pontos = ordenado.ToList()
        End Sub

        ''' <summary>Diferença Z - CotaAtributo, ou Nothing quando não há atributo de cota.</summary>
        Private Shared Function Delta(p As PontoCotado) As Double?
            If Not p.CotaAtributo.HasValue Then Return Nothing
            Return p.Z - p.CotaAtributo.Value
        End Function

        ''' <summary>
        ''' Ordena por um campo Double? — pontos sem valor vão para o fim da lista,
        ''' nas duas direções, para não misturar com valores reais.
        ''' </summary>
        Private Shared Function OrdenarPorNulavel(pontos As List(Of PontoCotado),
                                                   seletor As Func(Of PontoCotado, Double?),
                                                   crescente As Boolean) As IEnumerable(Of PontoCotado)
            Dim comValor As IEnumerable(Of PontoCotado) = pontos.Where(Function(p) seletor(p).HasValue)
            Dim semValor As IEnumerable(Of PontoCotado) = pontos.Where(Function(p) Not seletor(p).HasValue)

            comValor = If(crescente,
                comValor.OrderBy(Function(p) seletor(p).Value),
                comValor.OrderByDescending(Function(p) seletor(p).Value))

            Return comValor.Concat(semValor)
        End Function

    End Class

End Namespace
