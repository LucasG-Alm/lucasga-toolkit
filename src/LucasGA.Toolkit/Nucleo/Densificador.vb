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
        ''' incluirOriginais=False descarta os vértices medidos, mantendo apenas
        ''' os interpolados e as extremidades de cada segmento.
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

                Dim d As Double = Ordenador.DistanciaXY(a, b)
                Dim n As Integer = CInt(Math.Floor(d / passoMetros))

                For k As Integer = 1 To n - 1
                    Dim t As Double = (k * passoMetros) / d
                    If t >= 1.0 Then Exit For
                    saida.Add(New PontoCotado With {
                        .X = a.X + (b.X - a.X) * t,
                        .Y = a.Y + (b.Y - a.Y) * t,
                        .Z = a.Z + (b.Z - a.Z) * t,
                        .Layer = a.Layer,
                        .Descricao = DescricaoInterpolado
                    })
                Next
            Next

            saida.Add(pontos(pontos.Count - 1))
            Return saida
        End Function

    End Module

End Namespace
