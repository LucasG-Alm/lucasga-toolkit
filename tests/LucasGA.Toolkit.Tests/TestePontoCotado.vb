Option Strict On
Option Explicit On

Imports Xunit
Imports Nucleo

Public Class TestePontoCotado

    <Fact>
    Public Sub LerCota_aceita_virgula_decimal()
        Assert.Equal(721.625, PontoCotado.LerCota("721,625").Value, 3)
    End Sub

    <Fact>
    Public Sub LerCota_aceita_ponto_decimal()
        Assert.Equal(721.625, PontoCotado.LerCota("721.625").Value, 3)
    End Sub

    <Fact>
    Public Sub LerCota_devolve_nothing_para_texto_invalido()
        Assert.False(PontoCotado.LerCota("Fundo").HasValue)
    End Sub

    <Fact>
    Public Sub LerCota_devolve_nothing_para_vazio()
        Assert.False(PontoCotado.LerCota("").HasValue)
        Assert.False(PontoCotado.LerCota(Nothing).HasValue)
    End Sub

    <Fact>
    Public Sub Alerta_combina_como_flags()
        Dim a As Alerta = Alerta.DivergenciaCota Or Alerta.ZSuspeito
        Assert.True((a And Alerta.DivergenciaCota) = Alerta.DivergenciaCota)
        Assert.True((a And Alerta.ZSuspeito) = Alerta.ZSuspeito)
        Assert.False((a And Alerta.DuplicadoXY) = Alerta.DuplicadoXY)
    End Sub

End Class
