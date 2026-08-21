Option Strict On
Option Explicit On

Imports System.Collections.Generic
Imports Xunit
Imports Nucleo

Public Class TesteAnalisadorDeAlertas

    Private Shared Function P(x As Double, y As Double, z As Double, Optional attr As Double? = Nothing) As PontoCotado
        Return New PontoCotado With {.X = x, .Y = y, .Z = z, .CotaAtributo = attr}
    End Function

    Private Shared Function FaixaLarga() As FaixaDeCota
        Return New FaixaDeCota With {.Minimo = -100000.0, .Maximo = 100000.0}
    End Function

    <Fact>
    Public Sub Divergencia_entre_Z_e_atributo_e_marcada()
        Dim lista As New List(Of PontoCotado) From {P(0, 0, 721.625, 725.0)}
        AnalisadorDeAlertas.Analisar(lista, FaixaLarga())
        Assert.True((lista(0).Alertas And Alerta.DivergenciaCota) = Alerta.DivergenciaCota)
    End Sub

    <Fact>
    Public Sub Coincidencia_dentro_da_tolerancia_nao_e_marcada()
        Dim lista As New List(Of PontoCotado) From {P(0, 0, 721.625, 721.6255)}
        AnalisadorDeAlertas.Analisar(lista, FaixaLarga())
        Assert.False((lista(0).Alertas And Alerta.DivergenciaCota) = Alerta.DivergenciaCota)
    End Sub

    <Fact>
    Public Sub Ponto_sem_atributo_nunca_diverge()
        Dim lista As New List(Of PontoCotado) From {P(0, 0, 721.625)}
        AnalisadorDeAlertas.Analisar(lista, FaixaLarga())
        Assert.False((lista(0).Alertas And Alerta.DivergenciaCota) = Alerta.DivergenciaCota)
    End Sub

    <Fact>
    Public Sub Z_zero_exato_e_suspeito()
        Dim lista As New List(Of PontoCotado) From {P(0, 0, 0.0)}
        AnalisadorDeAlertas.Analisar(lista, FaixaLarga())
        Assert.True((lista(0).Alertas And Alerta.ZSuspeito) = Alerta.ZSuspeito)
    End Sub

    <Fact>
    Public Sub Z_fora_da_faixa_e_suspeito()
        Dim lista As New List(Of PontoCotado) From {P(0, 0, 1464.5)}
        Dim faixa As New FaixaDeCota With {.Minimo = 700.0, .Maximo = 760.0}
        AnalisadorDeAlertas.Analisar(lista, faixa)
        Assert.True((lista(0).Alertas And Alerta.ZSuspeito) = Alerta.ZSuspeito)
    End Sub

    <Fact>
    Public Sub Pontos_no_mesmo_XY_com_Z_diferente_sao_marcados()
        ' topo e pe de muro levantados na mesma estacao
        Dim lista As New List(Of PontoCotado) From {
            P(10.0, 20.0, 726.0), P(10.0, 20.0, 733.0), P(50.0, 50.0, 730.0)
        }
        AnalisadorDeAlertas.Analisar(lista, FaixaLarga())
        Assert.True((lista(0).Alertas And Alerta.DuplicadoXY) = Alerta.DuplicadoXY)
        Assert.True((lista(1).Alertas And Alerta.DuplicadoXY) = Alerta.DuplicadoXY)
        Assert.False((lista(2).Alertas And Alerta.DuplicadoXY) = Alerta.DuplicadoXY)
    End Sub

    <Fact>
    Public Sub Pontos_identicos_em_XY_e_Z_nao_sao_duplicidade_de_muro()
        Dim lista As New List(Of PontoCotado) From {
            P(10.0, 20.0, 726.0), P(10.0, 20.0, 726.0)
        }
        AnalisadorDeAlertas.Analisar(lista, FaixaLarga())
        Assert.False((lista(0).Alertas And Alerta.DuplicadoXY) = Alerta.DuplicadoXY)
    End Sub

    <Fact>
    Public Sub Analisar_devolve_a_contagem_de_pontos_com_alerta()
        Dim lista As New List(Of PontoCotado) From {
            P(0, 0, 0.0), P(1, 1, 725.0), P(2, 2, 726.0, 999.0)
        }
        Assert.Equal(2, AnalisadorDeAlertas.Analisar(lista, FaixaLarga()))
    End Sub

    <Fact>
    Public Sub FaixaPlausivel_acomoda_a_nuvem_normal()
        Dim lista As New List(Of PontoCotado)()
        For i As Integer = 0 To 20
            lista.Add(P(i, 0, 720.0 + i * 0.5))
        Next
        Dim faixa = AnalisadorDeAlertas.CalcularFaixaPlausivel(lista)
        Assert.True(faixa.Minimo <= 720.0)
        Assert.True(faixa.Maximo >= 730.0)
    End Sub

    <Fact>
    Public Sub FaixaPlausivel_exclui_outlier_grosseiro()
        Dim lista As New List(Of PontoCotado)()
        For i As Integer = 0 To 20
            lista.Add(P(i, 0, 720.0 + i * 0.5))
        Next
        lista.Add(P(99, 0, 2196.851))
        Dim faixa = AnalisadorDeAlertas.CalcularFaixaPlausivel(lista)
        Assert.True(faixa.Maximo < 2196.851)
    End Sub

End Class
