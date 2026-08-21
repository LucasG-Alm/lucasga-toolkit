Option Strict On
Option Explicit On

Imports System.Collections.Generic
Imports System.Globalization
Imports System.IO
Imports System.Linq
Imports System.Text

Namespace Nucleo

    ''' <summary>Configuração da exportação para o Revit.</summary>
    Public Class OpcoesCsv
        ''' <summary>Easting subtraído de cada X. O Revit perde precisão longe da origem.</summary>
        Public Property OrigemE As Double = 0.0
        ''' <summary>Northing subtraído de cada Y.</summary>
        Public Property OrigemN As Double = 0.0
        Public Property Densificar As Boolean = False
        Public Property PassoMetros As Double = 0.5
        Public Property IncluirOriginais As Boolean = True
    End Class

    ''' <summary>
    ''' Escreve o arquivo de pontos no formato que o Revit espera em
    ''' Toposolid → Create from Import → Points File: X,Y,Z sem cabeçalho.
    ''' </summary>
    Public Module ExportadorCsv

        ''' <summary>
        ''' Produz as linhas do arquivo. Considera apenas pontos marcados,
        ''' na ordem em que chegam.
        ''' </summary>
        Public Function GerarLinhas(pontos As List(Of PontoCotado), opcoes As OpcoesCsv) As List(Of String)
            Dim linhas As New List(Of String)()
            If pontos Is Nothing OrElse pontos.Count = 0 Then Return linhas

            Dim op As OpcoesCsv = If(opcoes, New OpcoesCsv())
            Dim usados As List(Of PontoCotado) = pontos.Where(Function(p) p.Marcado).ToList()
            If usados.Count = 0 Then Return linhas

            If op.Densificar AndAlso op.PassoMetros > 0.0 Then
                usados = Densificador.Densificar(usados, op.PassoMetros, op.IncluirOriginais)
            End If

            Dim ci As CultureInfo = CultureInfo.InvariantCulture
            For Each p As PontoCotado In usados
                linhas.Add(String.Format(ci, "{0:F3},{1:F3},{2:F3}",
                                         p.X - op.OrigemE,
                                         p.Y - op.OrigemN,
                                         p.Z))
            Next

            Return linhas
        End Function

        ''' <summary>
        ''' Grava o arquivo em UTF-8 sem BOM. Devolve o número de linhas escritas.
        ''' Exceções de E/S sobem para quem chamou tratar.
        ''' </summary>
        Public Function Salvar(pontos As List(Of PontoCotado), opcoes As OpcoesCsv, caminho As String) As Integer
            Dim linhas As List(Of String) = GerarLinhas(pontos, opcoes)
            File.WriteAllLines(caminho, linhas, New UTF8Encoding(False))
            Return linhas.Count
        End Function

    End Module

End Namespace
