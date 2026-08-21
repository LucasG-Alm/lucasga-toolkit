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

    <Fact>
    Public Sub Densificar_polilinha_3_pontos_com_originais_True()
        ' linha com 3 vértices medidos: A-B-C, cada segmento tem 10 m
        ' passo 5 m, incluirOriginais=True
        ' esperado: A, interpol(A-B), B, interpol(B-C), C (5 pontos)
        ' o vértice medido B intermediário deve aparecer com Descricao vazio
        Dim entrada As New List(Of PontoCotado) From {
            P(0, 0, 0), P(10, 0, 100), P(20, 0, 200)
        }
        Dim saida = Densificador.Densificar(entrada, 5.0, True)

        Assert.Equal(5, saida.Count)
        ' Primeiro ponto (medido)
        Assert.Equal(0.0, saida(0).X, 3)
        Assert.NotEqual("interpolado", saida(0).Descricao)
        ' Segundo ponto (interpolado no segmento A-B)
        Assert.Equal(5.0, saida(1).X, 3)
        Assert.Equal("interpolado", saida(1).Descricao)
        Assert.Equal(50.0, saida(1).Z, 3)
        ' Terceiro ponto (medido intermediário)
        Assert.Equal(10.0, saida(2).X, 3)
        Assert.NotEqual("interpolado", saida(2).Descricao)
        Assert.Equal(100.0, saida(2).Z, 3)
        ' Quarto ponto (interpolado no segmento B-C)
        Assert.Equal(15.0, saida(3).X, 3)
        Assert.Equal("interpolado", saida(3).Descricao)
        Assert.Equal(150.0, saida(3).Z, 3)
        ' Quinto ponto (medido final)
        Assert.Equal(20.0, saida(4).X, 3)
        Assert.NotEqual("interpolado", saida(4).Descricao)
        Assert.Equal(200.0, saida(4).Z, 3)
    End Sub

    <Fact>
    Public Sub Densificar_polilinha_3_pontos_com_originais_False()
        ' mesma linha com 3 vértices, mas incluirOriginais=False
        ' esperado: A, interpol(A-B), interpol(B-C), C (4 pontos)
        ' o vértice medido B intermediário deve SER DESCARTADO
        Dim entrada As New List(Of PontoCotado) From {
            P(0, 0, 0), P(10, 0, 100), P(20, 0, 200)
        }
        Dim saida = Densificador.Densificar(entrada, 5.0, False)

        Assert.Equal(4, saida.Count)
        ' Primeiro ponto (medido, sempre incluído quando i=0)
        Assert.Equal(0.0, saida(0).X, 3)
        Assert.NotEqual("interpolado", saida(0).Descricao)
        ' Segundo ponto (interpolado no segmento A-B)
        Assert.Equal(5.0, saida(1).X, 3)
        Assert.Equal("interpolado", saida(1).Descricao)
        Assert.Equal(50.0, saida(1).Z, 3)
        ' Terceiro ponto (interpolado no segmento B-C, B foi descartado)
        Assert.Equal(15.0, saida(2).X, 3)
        Assert.Equal("interpolado", saida(2).Descricao)
        Assert.Equal(150.0, saida(2).Z, 3)
        ' Quarto ponto (medido final)
        Assert.Equal(20.0, saida(3).X, 3)
        Assert.NotEqual("interpolado", saida(3).Descricao)
        Assert.Equal(200.0, saida(3).Z, 3)
    End Sub

    <Fact>
    Public Sub Densificar_pontos_coincidentes_XY_sem_NaN()
        ' topo e pé de muro levantados na mesma estação (mesmo XY, Z diferente)
        ' distância XY = 0, então não há interpolação (n=0)
        ' verifica que não há NaN ou Infinity em nenhuma coordenada
        Dim entrada As New List(Of PontoCotado) From {
            P(100, 100, 0), P(100, 100, 10)
        }
        Dim saida = Densificador.Densificar(entrada, 5.0, True)

        Assert.Equal(2, saida.Count)
        ' Verifica que nenhuma coordenada é NaN ou Infinity
        For Each ponto In saida
            Assert.False(Double.IsNaN(ponto.X), "X não deve ser NaN")
            Assert.False(Double.IsInfinity(ponto.X), "X não deve ser Infinity")
            Assert.False(Double.IsNaN(ponto.Y), "Y não deve ser NaN")
            Assert.False(Double.IsInfinity(ponto.Y), "Y não deve ser Infinity")
            Assert.False(Double.IsNaN(ponto.Z), "Z não deve ser NaN")
            Assert.False(Double.IsInfinity(ponto.Z), "Z não deve ser Infinity")
        Next

        ' Pontos originais preservados
        Assert.Equal(100.0, saida(0).X, 3)
        Assert.Equal(100.0, saida(0).Y, 3)
        Assert.Equal(0.0, saida(0).Z, 3)
        Assert.Equal(100.0, saida(1).X, 3)
        Assert.Equal(100.0, saida(1).Y, 3)
        Assert.Equal(10.0, saida(1).Z, 3)
    End Sub

    <Fact>
    Public Sub Densificar_segmento_nao_multiplo_do_passo_nao_perde_vertice()
        ' d = 9,9 m, passo = 5 m. Critério antigo (n = Floor(9,9/5) = 1, laço
        ' 1 To 0) não gerava nenhum vértice interpolado. O correto é gerar um em
        ' 5 m, porque 5 < 9,9 (múltiplo do passo estritamente menor que d).
        Dim entrada As New List(Of PontoCotado) From {P(0, 0, 0), P(9.9, 0, 0)}
        Dim saida = Densificador.Densificar(entrada, 5.0, True)

        Assert.Equal(3, saida.Count)
        Assert.Equal(0.0, saida(0).X, 3)
        Assert.NotEqual("interpolado", saida(0).Descricao)
        Assert.Equal(5.0, saida(1).X, 3)
        Assert.Equal("interpolado", saida(1).Descricao)
        Assert.Equal(9.9, saida(2).X, 3)
        Assert.NotEqual("interpolado", saida(2).Descricao)
    End Sub

    <Fact>
    Public Sub Densificar_segmento_com_resto_nao_pula_multiplo_intermediario()
        ' d = 7 m, passo = 2 m. Critério antigo (n = Floor(7/2) = 3, laço 1 To 2)
        ' gerava só em 2 e 4 m, pulando o de 6 m. O correto gera em 2, 4 e 6 m —
        ' todo múltiplo do passo estritamente menor que d.
        Dim entrada As New List(Of PontoCotado) From {P(0, 0, 0), P(7, 0, 0)}
        Dim saida = Densificador.Densificar(entrada, 2.0, True)

        Assert.Equal(5, saida.Count)
        Assert.Equal(0.0, saida(0).X, 3)
        Assert.NotEqual("interpolado", saida(0).Descricao)
        Assert.Equal(2.0, saida(1).X, 3)
        Assert.Equal("interpolado", saida(1).Descricao)
        Assert.Equal(4.0, saida(2).X, 3)
        Assert.Equal("interpolado", saida(2).Descricao)
        Assert.Equal(6.0, saida(3).X, 3)
        Assert.Equal("interpolado", saida(3).Descricao)
        Assert.Equal(7.0, saida(4).X, 3)
        Assert.NotEqual("interpolado", saida(4).Descricao)
    End Sub

End Class
