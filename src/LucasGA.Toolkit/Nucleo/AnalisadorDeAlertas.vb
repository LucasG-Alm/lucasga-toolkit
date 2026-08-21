Option Strict On
Option Explicit On

Imports System.Collections.Generic
Imports System.Linq

Namespace Nucleo

    ''' <summary>Intervalo de cota considerado plausível para a seleção.</summary>
    Public Class FaixaDeCota
        Public Property Minimo As Double
        Public Property Maximo As Double
    End Class

    ''' <summary>
    ''' Sinaliza problemas nos pontos. Nunca corrige, nunca descarta —
    ''' o usuário vê e decide.
    ''' </summary>
    Public Module AnalisadorDeAlertas

        ''' <summary>Diferença máxima aceita entre Z e atributo de cota, em metros.</summary>
        Public Const ToleranciaCota As Double = 0.001

        ''' <summary>Distância máxima em XY para considerar dois pontos coincidentes.</summary>
        Public Const ToleranciaXY As Double = 0.001

        ''' <summary>
        ''' Faixa plausível a partir da própria nuvem: mediana ± 3× o intervalo
        ''' interquartil. Resiste a outlier grosseiro porque nem mediana nem IQR
        ''' se deslocam com valores extremos isolados.
        ''' Com menos de 4 pontos, devolve faixa aberta.
        ''' </summary>
        Public Function CalcularFaixaPlausivel(pontos As List(Of PontoCotado)) As FaixaDeCota
            If pontos Is Nothing OrElse pontos.Count < 4 Then
                Return New FaixaDeCota With {.Minimo = Double.MinValue, .Maximo = Double.MaxValue}
            End If

            Dim z As List(Of Double) = pontos.Select(Function(p) p.Z).OrderBy(Function(v) v).ToList()
            Dim q1 As Double = Percentil(z, 0.25)
            Dim q3 As Double = Percentil(z, 0.75)
            Dim mediana As Double = Percentil(z, 0.5)
            Dim iqr As Double = q3 - q1

            If iqr <= 0.0 Then
                Return New FaixaDeCota With {.Minimo = mediana - 1.0, .Maximo = mediana + 1.0}
            End If

            Return New FaixaDeCota With {
                .Minimo = mediana - 3.0 * iqr,
                .Maximo = mediana + 3.0 * iqr
            }
        End Function

        ''' <summary>
        ''' Aplica todos os alertas à lista. Devolve quantos pontos ficaram com
        ''' pelo menos um alerta. Preserva alertas já existentes (SaltoNaCadeia).
        ''' </summary>
        Public Function Analisar(pontos As List(Of PontoCotado), faixa As FaixaDeCota) As Integer
            If pontos Is Nothing OrElse pontos.Count = 0 Then Return 0

            For Each p As PontoCotado In pontos
                p.Alertas = p.Alertas And Not (Alerta.DivergenciaCota Or Alerta.ZSuspeito Or Alerta.DuplicadoXY)

                If p.CotaAtributo.HasValue AndAlso
                   Math.Abs(p.Z - p.CotaAtributo.Value) > ToleranciaCota Then
                    p.Alertas = p.Alertas Or Alerta.DivergenciaCota
                End If

                If p.Z = 0.0 OrElse p.Z < faixa.Minimo OrElse p.Z > faixa.Maximo Then
                    p.Alertas = p.Alertas Or Alerta.ZSuspeito
                End If
            Next

            MarcarDuplicidadeXY(pontos)

            Return pontos.Where(Function(p) p.Alertas <> Alerta.Nenhum).Count()
        End Function

        ''' <summary>
        ''' Marca pares no mesmo XY com Z diferente — assinatura de topo e pé de
        ''' muro. Ligá-los numa polilinha cria uma parede vertical dentro de uma
        ''' linha de terreno.
        ''' </summary>
        Private Sub MarcarDuplicidadeXY(pontos As List(Of PontoCotado))
            For i As Integer = 0 To pontos.Count - 2
                For j As Integer = i + 1 To pontos.Count - 1
                    Dim dx As Double = Math.Abs(pontos(i).X - pontos(j).X)
                    Dim dy As Double = Math.Abs(pontos(i).Y - pontos(j).Y)
                    If dx <= ToleranciaXY AndAlso dy <= ToleranciaXY Then
                        If Math.Abs(pontos(i).Z - pontos(j).Z) > ToleranciaCota Then
                            pontos(i).Alertas = pontos(i).Alertas Or Alerta.DuplicadoXY
                            pontos(j).Alertas = pontos(j).Alertas Or Alerta.DuplicadoXY
                        End If
                    End If
                Next
            Next
        End Sub

        ''' <summary>Percentil por interpolação linear. Lista deve vir ordenada.</summary>
        Private Function Percentil(ordenados As List(Of Double), fracao As Double) As Double
            If ordenados.Count = 1 Then Return ordenados(0)
            Dim pos As Double = fracao * (ordenados.Count - 1)
            Dim baixo As Integer = CInt(Math.Floor(pos))
            Dim alto As Integer = CInt(Math.Ceiling(pos))
            If baixo = alto Then Return ordenados(baixo)
            Return ordenados(baixo) + (ordenados(alto) - ordenados(baixo)) * (pos - baixo)
        End Function

    End Module

End Namespace
