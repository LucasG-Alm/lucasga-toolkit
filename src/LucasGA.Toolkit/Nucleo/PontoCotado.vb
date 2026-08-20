Option Strict On
Option Explicit On

Imports System.Globalization

Namespace Nucleo

    ''' <summary>Sinalizações de problema detectadas num ponto. Combináveis.</summary>
    <Flags>
    Public Enum Alerta
        Nenhum = 0
        DivergenciaCota = 1
        ZSuspeito = 2
        DuplicadoXY = 4
        SaltoNaCadeia = 8
    End Enum

    ''' <summary>
    ''' Um ponto cotado lido do desenho. O Z da geometria é a fonte da cota;
    ''' CotaAtributo é apenas o rótulo gravado no bloco.
    ''' </summary>
    Public Class PontoCotado

        Public Property Handle As String = String.Empty
        Public Property X As Double
        Public Property Y As Double
        Public Property Z As Double
        Public Property Layer As String = String.Empty
        Public Property Numero As String = String.Empty
        Public Property Descricao As String = String.Empty
        Public Property CotaAtributo As Double?
        Public Property OrdemSelecao As Integer
        Public Property Alertas As Alerta = Alerta.Nenhum
        Public Property Marcado As Boolean = True

        ''' <summary>
        ''' Converte o texto de um atributo em número. Os blocos do levantamento
        ''' gravam vírgula decimal ("721,625"); alguns gravam ponto.
        ''' Devolve Nothing quando o texto não é numérico.
        ''' </summary>
        Public Shared Function LerCota(texto As String) As Double?
            If String.IsNullOrWhiteSpace(texto) Then Return Nothing

            Dim limpo As String = texto.Trim().Replace(" ", "")
            Dim valor As Double

            If Double.TryParse(limpo, NumberStyles.Float, CultureInfo.InvariantCulture, valor) Then
                Return valor
            End If

            limpo = limpo.Replace(","c, "."c)
            If Double.TryParse(limpo, NumberStyles.Float, CultureInfo.InvariantCulture, valor) Then
                Return valor
            End If

            Return Nothing
        End Function

    End Class

End Namespace
