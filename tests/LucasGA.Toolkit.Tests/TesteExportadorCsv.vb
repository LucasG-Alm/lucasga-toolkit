Option Strict On
Option Explicit On

Imports System.Collections.Generic
Imports System.IO
Imports Xunit
Imports Nucleo

Public Class TesteExportadorCsv

    Private Shared Function P(x As Double, y As Double, z As Double) As PontoCotado
        Return New PontoCotado With {.X = x, .Y = y, .Z = z}
    End Function

    <Fact>
    Public Sub Gera_uma_linha_por_ponto_com_tres_casas()
        Dim lista As New List(Of PontoCotado) From {P(1.2345, 2.3456, 721.6251)}
        Dim linhas = ExportadorCsv.GerarLinhas(lista, New OpcoesCsv())
        Assert.Single(linhas)
        Assert.Equal("1.234,2.346,721.625", linhas(0))
    End Sub

    <Fact>
    Public Sub Usa_ponto_decimal_independente_da_cultura()
        Dim lista As New List(Of PontoCotado) From {P(0.5, 0.5, 0.5)}
        Dim linhas = ExportadorCsv.GerarLinhas(lista, New OpcoesCsv())
        Assert.DoesNotContain(",5", linhas(0).Replace("0.5", ""))
        Assert.Equal("0.500,0.500,0.500", linhas(0))
    End Sub

    <Fact>
    Public Sub Subtrai_a_origem_local()
        Dim lista As New List(Of PontoCotado) From {P(321471.94, 7388259.613, 721.625)}
        Dim op As New OpcoesCsv With {.OrigemE = 321200.0, .OrigemN = 7388100.0}
        Dim linhas = ExportadorCsv.GerarLinhas(lista, op)
        Assert.Equal("271.940,159.613,721.625", linhas(0))
    End Sub

    <Fact>
    Public Sub Nao_densifica_quando_a_opcao_esta_desligada()
        Dim lista As New List(Of PontoCotado) From {P(0, 0, 0), P(10, 0, 0)}
        Dim op As New OpcoesCsv With {.Densificar = False, .PassoMetros = 1.0}
        Assert.Equal(2, ExportadorCsv.GerarLinhas(lista, op).Count)
    End Sub

    <Fact>
    Public Sub Densifica_quando_a_opcao_esta_ligada()
        Dim lista As New List(Of PontoCotado) From {P(0, 0, 0), P(10, 0, 0)}
        Dim op As New OpcoesCsv With {.Densificar = True, .PassoMetros = 2.0, .IncluirOriginais = True}
        Assert.Equal(6, ExportadorCsv.GerarLinhas(lista, op).Count)
    End Sub

    <Fact>
    Public Sub Ignora_pontos_desmarcados()
        Dim a = P(0, 0, 0)
        Dim b = P(10, 0, 0)
        b.Marcado = False
        Dim lista As New List(Of PontoCotado) From {a, b}
        Assert.Single(ExportadorCsv.GerarLinhas(lista, New OpcoesCsv()))
    End Sub

    <Fact>
    Public Sub Salvar_grava_o_arquivo_e_devolve_a_contagem()
        Dim lista As New List(Of PontoCotado) From {P(1, 2, 3), P(4, 5, 6)}
        Dim caminho As String = Path.Combine(Path.GetTempPath(), "pts3d_" & Guid.NewGuid().ToString("N") & ".csv")
        Try
            Dim n As Integer = ExportadorCsv.Salvar(lista, New OpcoesCsv(), caminho)
            Assert.Equal(2, n)
            Assert.True(File.Exists(caminho))
            Assert.Equal(2, File.ReadAllLines(caminho).Length)
        Finally
            If File.Exists(caminho) Then File.Delete(caminho)
        End Try
    End Sub

    <Fact>
    Public Sub Lista_vazia_gera_zero_linhas()
        Assert.Empty(ExportadorCsv.GerarLinhas(New List(Of PontoCotado)(), New OpcoesCsv()))
    End Sub

End Class
