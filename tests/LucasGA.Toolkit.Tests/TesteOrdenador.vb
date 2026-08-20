Option Strict On
Option Explicit On

Imports System.Collections.Generic
Imports Xunit
Imports Nucleo

Public Class TesteOrdenador

    Private Shared Function P(numero As String, x As Double, y As Double, ordem As Integer) As PontoCotado
        Return New PontoCotado With {.Numero = numero, .X = x, .Y = y, .Z = 0.0, .OrdemSelecao = ordem}
    End Function

    <Fact>
    Public Sub OrdemSelecao_respeita_a_ordem_de_clique()
        Dim entrada As New List(Of PontoCotado) From {
            P("c", 0, 0, 2), P("a", 0, 0, 0), P("b", 0, 0, 1)
        }
        Dim saida = Ordenador.Ordenar(entrada, ModoOrdenacao.OrdemSelecao)
        Assert.Equal("a", saida(0).Numero)
        Assert.Equal("b", saida(1).Numero)
        Assert.Equal("c", saida(2).Numero)
    End Sub

    <Fact>
    Public Sub Manual_preserva_a_ordem_atual_da_lista()
        Dim entrada As New List(Of PontoCotado) From {
            P("c", 0, 0, 2), P("a", 0, 0, 0), P("b", 0, 0, 1)
        }
        Dim saida = Ordenador.Ordenar(entrada, ModoOrdenacao.Manual)
        Assert.Equal("c", saida(0).Numero)
        Assert.Equal("a", saida(1).Numero)
        Assert.Equal("b", saida(2).Numero)
    End Sub

    <Fact>
    Public Sub VizinhoMaisProximo_encadeia_linha_fora_de_ordem()
        ' pontos numa reta, embaralhados; deve sair 0,1,2,3
        Dim entrada As New List(Of PontoCotado) From {
            P("p0", 0, 0, 0), P("p3", 30, 0, 1), P("p1", 10, 0, 2), P("p2", 20, 0, 3)
        }
        Dim saida = Ordenador.Ordenar(entrada, ModoOrdenacao.VizinhoMaisProximo)
        Assert.Equal("p0", saida(0).Numero)
        Assert.Equal("p1", saida(1).Numero)
        Assert.Equal("p2", saida(2).Numero)
        Assert.Equal("p3", saida(3).Numero)
    End Sub

    <Fact>
    Public Sub VizinhoMaisProximo_comeca_pelo_primeiro_da_selecao()
        Dim entrada As New List(Of PontoCotado) From {
            P("meio", 10, 0, 0), P("fim", 20, 0, 1), P("inicio", 0, 0, 2)
        }
        Dim saida = Ordenador.Ordenar(entrada, ModoOrdenacao.VizinhoMaisProximo)
        Assert.Equal("meio", saida(0).Numero)
    End Sub

    <Fact>
    Public Sub MarcarSaltos_sinaliza_o_ponto_que_pulou_de_trecho()
        ' quatro pontos a 1 m e um a 50 m: o ultimo e o salto
        Dim entrada As New List(Of PontoCotado) From {
            P("a", 0, 0, 0), P("b", 1, 0, 1), P("c", 2, 0, 2), P("d", 3, 0, 3), P("longe", 53, 0, 4)
        }
        Dim marcados = Ordenador.MarcarSaltos(entrada, 3.0)
        Assert.Equal(1, marcados)
        Assert.True((entrada(4).Alertas And Alerta.SaltoNaCadeia) = Alerta.SaltoNaCadeia)
        Assert.False((entrada(1).Alertas And Alerta.SaltoNaCadeia) = Alerta.SaltoNaCadeia)
    End Sub

    <Fact>
    Public Sub MarcarSaltos_nao_marca_nada_em_cadeia_regular()
        Dim entrada As New List(Of PontoCotado) From {
            P("a", 0, 0, 0), P("b", 1, 0, 1), P("c", 2, 0, 2), P("d", 3, 0, 3)
        }
        Assert.Equal(0, Ordenador.MarcarSaltos(entrada, 3.0))
    End Sub

    <Fact>
    Public Sub Ordenar_com_lista_vazia_devolve_lista_vazia()
        Assert.Empty(Ordenador.Ordenar(New List(Of PontoCotado)(), ModoOrdenacao.VizinhoMaisProximo))
    End Sub

    <Fact>
    Public Sub Ordenar_com_um_ponto_devolve_o_proprio()
        Dim entrada As New List(Of PontoCotado) From {P("unico", 5, 5, 0)}
        Assert.Single(Ordenador.Ordenar(entrada, ModoOrdenacao.VizinhoMaisProximo))
    End Sub

End Class
