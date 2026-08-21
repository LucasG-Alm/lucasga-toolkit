Option Strict On
Option Explicit On

Imports System.Collections.Generic
Imports Xunit
Imports Nucleo

Public Class TesteDensificador

    Private Shared Function P(x As Double, y As Double, z As Double) As PontoCotado
        Return New PontoCotado With {.X = x, .Y = y, .Z = z}
    End Function

    <Fact>
    Public Sub Densificar_insere_vertices_no_passo_pedido()
        ' reta de 10 m, passo 2 m -> 6 pontos (0,2,4,6,8,10)
        Dim entrada As New List(Of PontoCotado) From {P(0, 0, 100), P(10, 0, 100)}
        Dim saida = Densificador.Densificar(entrada, 2.0, True)
        Assert.Equal(6, saida.Count)
        Assert.Equal(0.0, saida(0).X, 3)
        Assert.Equal(2.0, saida(1).X, 3)
        Assert.Equal(10.0, saida(5).X, 3)
    End Sub

    <Fact>
    Public Sub Densificar_interpola_a_cota_linearmente()
        ' de Z=100 a Z=110 em 10 m, passo 5 m -> meio deve ser 105
        Dim entrada As New List(Of PontoCotado) From {P(0, 0, 100), P(10, 0, 110)}
        Dim saida = Densificador.Densificar(entrada, 5.0, True)
        Assert.Equal(3, saida.Count)
        Assert.Equal(105.0, saida(1).Z, 3)
    End Sub

    <Fact>
    Public Sub Densificar_preserva_o_ultimo_vertice_exato()
        Dim entrada As New List(Of PontoCotado) From {P(0, 0, 0), P(7, 0, 0)}
        Dim saida = Densificador.Densificar(entrada, 2.0, True)
        Assert.Equal(7.0, saida(saida.Count - 1).X, 3)
    End Sub

    <Fact>
    Public Sub Densificar_com_passo_zero_devolve_os_originais()
        Dim entrada As New List(Of PontoCotado) From {P(0, 0, 0), P(10, 0, 0)}
        Dim saida = Densificador.Densificar(entrada, 0.0, True)
        Assert.Equal(2, saida.Count)
    End Sub

    <Fact>
    Public Sub Densificar_com_passo_maior_que_o_segmento_mantem_as_pontas()
        Dim entrada As New List(Of PontoCotado) From {P(0, 0, 0), P(1, 0, 0)}
        Dim saida = Densificador.Densificar(entrada, 50.0, True)
        Assert.Equal(2, saida.Count)
    End Sub

    <Fact>
    Public Sub Densificar_marca_os_pontos_gerados_como_interpolados()
        Dim entrada As New List(Of PontoCotado) From {P(0, 0, 0), P(10, 0, 0)}
        Dim saida = Densificador.Densificar(entrada, 5.0, True)
        Assert.Equal("interpolado", saida(1).Descricao)
        Assert.NotEqual("interpolado", saida(0).Descricao)
    End Sub

    <Fact>
    Public Sub Densificar_com_menos_de_dois_pontos_devolve_a_entrada()
        Dim entrada As New List(Of PontoCotado) From {P(1, 1, 1)}
        Assert.Single(Densificador.Densificar(entrada, 1.0, True))
    End Sub

End Class
