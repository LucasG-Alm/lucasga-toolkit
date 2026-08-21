Option Strict On
Option Explicit On

Imports System.Collections.Generic
Imports System.Windows.Forms
Imports Autodesk.AutoCAD.ApplicationServices
Imports Autodesk.AutoCAD.Windows
Imports Nucleo
Imports UI

Namespace Comandos.Pts3d

    ''' <summary>
    ''' PaletteSet ancorável e não-modal: o usuário continua operando o desenho
    ''' com a tabela aberta.
    ''' </summary>
    Public Module PaletaPts3d

        Private _paleta As PaletteSet
        Private _grade As GradeDePontos
        Private _doc As Document
        Private _pontos As New List(Of PontoCotado)()

        Public Sub Mostrar(doc As Document, pontos As List(Of PontoCotado))
            _doc = doc
            _pontos = pontos

            If _paleta Is Nothing Then Construir()

            _grade.Carregar(_pontos)
            _paleta.Visible = True
        End Sub

        Private Sub Construir()
            _paleta = New PaletteSet("PTS3D")
            _paleta.Style = PaletteSetStyles.ShowAutoHideButton Or
                            PaletteSetStyles.ShowCloseButton Or
                            PaletteSetStyles.Snappable
            _paleta.MinimumSize = New System.Drawing.Size(520, 300)

            Dim painel As New Panel() With {.Dock = DockStyle.Fill}
            _grade = New GradeDePontos() With {.Dock = DockStyle.Fill}

            Dim barra As New FlowLayoutPanel() With {.Dock = DockStyle.Bottom, .Height = 40, .Padding = New Padding(4)}
            Dim btDesenhar As New Button() With {.Text = "Desenhar 3DPOLY", .Width = 150, .Height = 28}
            Dim btCsv As New Button() With {.Text = "Exportar CSV", .Width = 120, .Height = 28}
            AddHandler btDesenhar.Click, AddressOf AoDesenhar
            AddHandler btCsv.Click, AddressOf AoExportar
            barra.Controls.Add(btDesenhar)
            barra.Controls.Add(btCsv)

            painel.Controls.Add(_grade)
            painel.Controls.Add(barra)
            _paleta.Add("Pontos", painel)
        End Sub

        Private Sub AoDesenhar(sender As Object, e As EventArgs)
            Dim ordenados As List(Of PontoCotado) = _grade.PontosNaOrdemExibida()

            Using _doc.LockDocument()
                Dim id = DesenhistaPolyline.Desenhar(_doc, ordenados, "PTS3D")
                If id.IsNull Then
                    MessageBox.Show("Marque ao menos 2 pontos para desenhar.", "PTS3D")
                Else
                    _doc.Editor.WriteMessage(vbLf & "3D Polyline criada." & vbLf)
                End If
            End Using
        End Sub

        Private Sub AoExportar(sender As Object, e As EventArgs)
            Using dlg As New System.Windows.Forms.SaveFileDialog()
                dlg.Filter = "CSV (*.csv)|*.csv"
                dlg.FileName = "pontos.csv"
                If dlg.ShowDialog() <> DialogResult.OK Then Return

                Try
                    Dim n As Integer = ExportadorCsv.Salvar(_grade.PontosNaOrdemExibida(), New OpcoesCsv(), dlg.FileName)
                    MessageBox.Show(n.ToString() & " ponto(s) exportado(s).", "PTS3D")
                Catch ex As Exception
                    MessageBox.Show("Falha ao gravar:" & vbLf & dlg.FileName & vbLf & vbLf & ex.Message, "PTS3D")
                End Try
            End Using
        End Sub

    End Module

End Namespace
