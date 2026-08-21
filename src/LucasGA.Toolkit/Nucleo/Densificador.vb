Option Strict On
Option Explicit On

Imports System.Collections.Generic
Imports System.Linq

Namespace Nucleo

    ''' <summary>
    ''' Insere vértices interpolados entre pontos consecutivos. Usado apenas na
    ''' exportação CSV — a polilinha desenhada preserva os pontos medidos.
    ''' </summary>
    Public Module Densificador

        Public Const DescricaoInterpolado As String = "interpolado"

        ''' <summary>
        ''' Interpola linearmente X, Y e Z ao longo de cada segmento.
        ''' passoMetros menor ou igual a zero devolve a lista original.
        ''' Com incluirOriginais=True, a saída contém todos os pontos medidos
        ''' originais mais os pontos interpolados.
        ''' Com incluirOriginais=False, a saída contém apenas o primeiro ponto medido,
        ''' os pontos interpolados de todos os segmentos, e o último ponto medido —
        ''' os vértices medidos intermediários são descartados.
        ''' </summary>
        Public Function Densificar(pontos As List(Of PontoCotado),
                                   passoMetros As Double,
                                   incluirOriginais As Boolean) As List(Of PontoCotado)

            If pontos Is Nothing OrElse pontos.Count < 2 Then
                Return If(pontos, New List(Of PontoCotado)()).ToList()
            End If

            If passoMetros <= 0.0 Then Return pontos.ToList()

            Dim saida As New List(Of PontoCotado)()

            For i As Integer = 0 To pontos.Count - 2
                Dim a As PontoCotado = pontos(i)
                Dim b As PontoCotado = pontos(i + 1)

                If incluirOriginais OrElse i = 0 Then saida.Add(a)

                ' Um vértice para cada múltiplo do passo estritamente menor que d.
                ' Antes o critério era n = Floor(d/passo) com laço 1 To n-1, que só
                ' acerta quando d é múltiplo exato do passo (ex.: d=9,9 passo=5
                ' zerava vértices; d=7 passo=2 pulava o de 6 m). Quando d=0 (pontos
                ' coincidentes em XY, caso de topo/pé de muro), k*passoMetros nunca
                ' é menor que d — o laço não roda e não há divisão por zero.
                Dim d As Double = Ordenador.DistanciaXY(a, b)
                Dim k As Integer = 1

                While k * passoMetros < d
                    Dim t As Double = (k * passoMetros) / d
                    saida.Add(New PontoCotado With {
                        .X = a.X + (b.X - a.X) * t,
                        .Y = a.Y + (b.Y - a.Y) * t,
                        .Z = a.Z + (b.Z - a.Z) * t,
                        .Layer = a.Layer,
                        .Descricao = DescricaoInterpolado
                    })
                    k += 1
                End While
            Next

            saida.Add(pontos(pontos.Count - 1))
            Return saida
        End Function

    End Module

End Namespace
