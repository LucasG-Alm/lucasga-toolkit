from dataclasses import dataclass


@dataclass(frozen=True)
class Tag:
    numero: int
    bitola: float
    comprimento_cm: int
    quantidade: int = 1
    multiplicador: int | None = None
    letra: str = "N"

    def formatar(self) -> str:
        prefixo = f"{self.multiplicador}x" if self.multiplicador else ""
        qtd = str(self.quantidade) if self.quantidade > 1 else ""
        bitola = (
            f"{self.bitola:g}"
            if self.bitola != int(self.bitola)
            else f"{int(self.bitola)}"
        )
        return (
            f"{prefixo}{qtd}{self.letra}{self.numero} "
            f"Ø{bitola} c={self.comprimento_cm}"
        )
