Option Strict On
Option Explicit On

Imports System.Collections.Generic
Imports System.Linq

Namespace Nucleo

    Public Enum ModoOrdenacao
        OrdemSelecao = 0
        VizinhoMaisProximo = 1
        Manual = 2
    End Enum

    ''' <summary>
    ''' Define a sequência dos vértices da polilinha. Não conhece o AutoCAD.
    ''' </summary>
    Public Module Ordenador

        ''' <summary>Devolve uma nova lista na ordem determinada pelo modo.</summary>
        Public Function Ordenar(pontos As List(Of PontoCotado), modo As ModoOrdenacao) As List(Of PontoCotado)
            If pontos Is Nothing OrElse pontos.Count <= 1 Then
                Return If(pontos, New List(Of PontoCotado)()).ToList()
            End If

            Select Case modo
                Case ModoOrdenacao.OrdemSelecao
                    Return pontos.OrderBy(Function(p) p.OrdemSelecao).ToList()
                Case ModoOrdenacao.VizinhoMaisProximo
                    Return EncadearPorProximidade(pontos)
                Case Else
                    Return pontos.ToList()
            End Select
        End Function

        ''' <summary>
        ''' Encadeamento guloso: começa no primeiro ponto da seleção e, a cada
        ''' passo, salta para o mais próximo ainda não usado (distância em XY).
        ''' </summary>
        Private Function EncadearPorProximidade(pontos As List(Of PontoCotado)) As List(Of PontoCotado)
            Dim restantes As New List(Of PontoCotado)(pontos)
            Dim atual As PontoCotado = restantes.OrderBy(Function(p) p.OrdemSelecao).First()
            restantes.Remove(atual)

            Dim cadeia As New List(Of PontoCotado) From {atual}

            While restantes.Count > 0
                Dim proximo As PontoCotado = restantes(0)
                Dim menor As Double = DistanciaXY(atual, proximo)

                For i As Integer = 1 To restantes.Count - 1
                    Dim d As Double = DistanciaXY(atual, restantes(i))
                    If d < menor Then
                        menor = d
                        proximo = restantes(i)
                    End If
                Next

                cadeia.Add(proximo)
                restantes.Remove(proximo)
                atual = proximo
            End While

            Return cadeia
        End Function

        ''' <summary>
        ''' Marca com SaltoNaCadeia todo ponto cuja distância ao anterior seja
        ''' maior que fator vezes a distância mediana da cadeia. Sintoma de
        ''' encadeamento que pulou para outra feição.
        ''' Devolve quantos pontos foram marcados.
        ''' </summary>
        Public Function MarcarSaltos(pontos As List(Of PontoCotado), fator As Double) As Integer
            If pontos Is Nothing Then Return 0

            ' Limpa antes de recalcular: sem isso a marca sobrevive à volta para
            ' outro modo de ordenação, ao arraste e à ordenação por cabeçalho,
            ' apontando para uma cadeia que não existe mais.
            For Each p As PontoCotado In pontos
                p.Alertas = p.Alertas And Not Alerta.SaltoNaCadeia
            Next

            If pontos.Count < 3 Then Return 0

            Dim distancias As New List(Of Double)()
            For i As Integer = 1 To pontos.Count - 1
                distancias.Add(DistanciaXY(pontos(i - 1), pontos(i)))
            Next

            Dim mediana As Double = Medianar(distancias)
            If mediana <= 0.0 Then Return 0

            Dim limite As Double = mediana * fator
            Dim marcados As Integer = 0

            For i As Integer = 1 To pontos.Count - 1
                If distancias(i - 1) > limite Then
                    pontos(i).Alertas = pontos(i).Alertas Or Alerta.SaltoNaCadeia
                    marcados += 1
                End If
            Next

            Return marcados
        End Function

        Public Function DistanciaXY(a As PontoCotado, b As PontoCotado) As Double
            Dim dx As Double = a.X - b.X
            Dim dy As Double = a.Y - b.Y
            Return Math.Sqrt(dx * dx + dy * dy)
        End Function

        ''' <summary>Mediana de uma lista de valores. Lista vazia devolve 0.</summary>
        Public Function Medianar(valores As List(Of Double)) As Double
            If valores Is Nothing OrElse valores.Count = 0 Then Return 0.0
            Dim v As List(Of Double) = valores.OrderBy(Function(d) d).ToList()
            Dim meio As Integer = v.Count \ 2
            If v.Count Mod 2 = 1 Then Return v(meio)
            Return (v(meio - 1) + v(meio)) / 2.0
        End Function

    End Module

End Namespace
