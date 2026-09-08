# Painel 8 — Vinte Anos de Câmara
*proposta* · 45 879 votações nominais · 5 mandatos · 2004–2026

Companheiro de `painel_evolucao.html`, que desenha os nove gráficos.
Tudo o que está aqui sai dos mesmos ficheiros que desenham as redes
(`data/final/ep_votes_6..10.json` e `2025/web/public/data/precomputed/`).

---

## Anotação para a imagem 1 — «Os dois grupos mais afastados»

Em cada mandato, esta linha mede a distância máxima do Parlamento: a percentagem de
votações em que os dois grupos que menos concordam um com o outro ainda assim tomaram a
mesma posição.

Durante quinze anos o valor quase não se mexeu — entre 43% e 36%. Mesmo os dois extremos
da câmara votavam juntos em mais de um terço das vezes, porque muita coisa que se decide
em Estrasburgo não é de esquerda nem de direita.

No mandato actual cai para 17,6%. Não é uma descida, é um corte. Os Verdes e a Europa das
Nações Soberanas votam do mesmo lado em menos de uma votação em cinco.

Reparem numa coisa: a linha não segue sempre o mesmo par. São dois grupos diferentes em
cada mandato, e é isso que ela diz de mais interessante. Em 2004 os dois extremos eram a
esquerda radical e o PPE — o eixo clássico esquerda-direita. Desde 2009 é sempre um grupo
de esquerda contra um grupo da direita radical. Mudou a distância, mas mudou sobretudo
quem está nas pontas.

*Os cinco pares:* 2004–09 GUE/NGL ~ PPE-DE, 43,0% · 2009–14 Verdes ~ ECR, 39,8% ·
2014–19 S&D ~ ENF, 36,2% · 2019–24 GUE/NGL ~ ECR, 36,0% · 2024–26 Verdes ~ ESN, 17,6%

---

## Anotação para a imagem 2 — as cinco redes

Cada ponto é um eurodeputado. Cada linha liga dois que votaram da mesma maneira em mais de
60% das votações. A posição é o que resulta de deixar essas linhas puxarem os pontos uns
para os outros até tudo parar. Ninguém pôs os grupos onde estão: a esquerda e a direita
aparecem em lados opostos porque é assim que votam.

Leiam cada desenho por dentro — quem está encostado a quem, quem ficou no meio de gente
que não é do seu grupo, que grupos se tocam e quais é que não se tocam nunca. Não comparem
os desenhos uns com os outros: o algoritmo que os arruma parte de posições aleatórias, por
isso a escala e a orientação de cada quadro são arbitrárias. Um mandato parecer mais
espalhado do que outro não quer dizer nada.

O que se compara é o que está por baixo do desenho: as linhas. Em 2004–09 havia linha
entre 74% de todos os pares de deputados possíveis. Hoje há entre 55%. Dentro de cada
grupo não se perdeu praticamente nada — 99% dos pares do mesmo grupo continuam ligados,
então como agora. O que desapareceu foi entre grupos: 67% dos pares de grupos diferentes
estavam ligados em 2004, hoje estão 47%.

E as ligações que restam são mais fortes do que eram: os pares de deputados que concordam
em mais de 80% das votações passaram de 22% para 34% da câmara. O Parlamento não se
afastou todo por igual. Ficou com menos pontes e com blocos mais apertados.

**Porque é que esta anotação não compara os desenhos.** O ForceAtlas2 começa em posições
aleatórias e a geometria final depende desse arranque, não só dos dados — duas execuções
sobre o mesmo mandato dão quadros de tamanhos diferentes. Tudo o que a anotação compara
entre mandatos é contado sobre os pares de deputados, sem passar pelo desenho. O gráfico 6
é a versão dos cinco quadros que se pode comparar.

---

## Os nove gráficos, e o que cada um diz

### 1. O centro fechou fileiras enquanto as pontas se afastavam
| | 2004–09 | 2009–14 | 2014–19 | 2019–24 | 2024–26 |
|---|---|---|---|---|---|
| Centro (PPE·S&D·liberais) | 71,9 | 74,6 | 77,5 | 78,6 | **83,0** |
| Os dois grupos mais afastados | 43,0 | 39,8 | 36,2 | 36,0 | **17,6** |

Dois movimentos opostos ao mesmo tempo. A grande coligação não se desfez: ficou mais unida
e ficou mais sozinha. Sobe em todos os mandatos sem excepção.
**Não dizer** que «o centro deixou de se entender» — os números dizem o contrário.

### 2. O PPE não foi para a direita. Os conservadores é que foram
| | 2004–09 | 2009–14 | 2014–19 | 2019–24 | 2024–26 |
|---|---|---|---|---|---|
| PPE ~ socialistas | 66,6 | 72,1 | 73,3 | 72,8 | **77,9** |
| PPE ~ direita radical | 51,2 | 56,2 | 41,3 | 55,1 | **40,6** |
| conservadores ~ direita radical | 53,9 | 66,4 | 53,9 | 72,3 | **77,9** |

O intervalo entre os dois parceiros possíveis do PPE passou de 15 para 37 pontos. Os
conservadores estão hoje tão perto da direita radical (77,9) quanto o PPE está dos
socialistas (77,9).
**Atenção:** a linha PPE ~ direita radical é um vaivém, não uma descida contínua. Mostrar
os cinco pontos.

### 3. A extrema-direita aprendeu a votar em conjunto
| | 2004–09 | 2009–14 | 2014–19 | 2019–24 | 2024–26 |
|---|---|---|---|---|---|
| Verdes | 94,2 | 95,6 | 97,2 | 97,3 | 96,4 |
| esquerda radical | 92,1 | 88,0 | 91,0 | 93,2 | 94,5 |
| socialistas | 91,7 | 91,9 | 93,5 | 93,8 | 94,3 |
| liberais | 89,4 | 89,3 | 89,7 | 89,9 | 92,4 |
| PPE | 88,2 | 92,4 | 93,5 | 91,0 | 91,8 |
| conservadores | 78,7 | 88,7 | 82,4 | 84,5 | 88,5 |
| **direita radical** | **63,3** | 64,6 | 69,4 | 84,4 | **91,3** |

Seis linhas planas e uma que atravessa o gráfico de baixo para cima. Ganhou disciplina sem
ganhar companhia: é hoje um dos blocos mais coesos da câmara e aquele com quem menos gente
vota.

### 4. Sete em cada dez adopções eram quase unânimes. Hoje são três
Só votações finais — o texto no seu conjunto, não as alterações.

| | 2004–09 | 2009–14 | 2014–19 | 2019–24 | 2024–26 |
|---|---|---|---|---|---|
| mais de 90% do mesmo lado | 71,3 | 52,2 | 33,0 | 51,2 | **30,9** |
| **o mesmo, sem os britânicos na sala** | 76,0 | 72,5 | 42,7 | 51,4 | 30,9 |
| ganhas por menos de 55–45 | 0,9 | 1,3 | 1,5 | 1,1 | **1,9** |
| margem mediana | 95,2 | 90,4 | 85,0 | 90,3 | **82,0** |
| n (votações finais) | 1 336 | 836 | 1 314 | 1 689 | 527 |
| dias de sessão | 190 | **59** | 230 | 238 | 103 |

**Não é uma descida contínua.** 71 · 52 · 33 · 51 · 31 — o mandato de 2014–19 já estava no
nível de hoje. Sem os britânicos a série é 76 · 73 · 43 · 51 · 31 e a queda de 2009–14
desaparece quase toda: era uma delegação a votar contra, não a câmara a dividir-se. Os dois
pontos seguros são as pontas.

**O salto de 2019–24.** Metade é mecânica — os britânicos saem em Fev/2020 e o mandato
anterior recalculado sem eles sobe 33 → 42,7. A outra metade é real e ampla: 9 das 16 áreas
sobem +20 pontos ou mais (Transportes +51, Controlo Orçamental +45, Desenvolvimento Regional
+33, Indústria +30), e a composição temática explica zero — o T9 refeito com a distribuição
de assuntos do T8 dá 52,2%, contra os 51,2% que dá sozinho. **Não é a pandemia:** a série
sobe ano após ano e o máximo é 2023 (38,8 · 47,8 · 52,4 · 53,9 · **55,6** · 48,1). Confirmado
por outro caminho no gráfico 1: descontando a direita radical, o T9 é o mandato de maior
concordância entre grupos dos cinco (65,8%).

**Porquê só as votações finais.** As finais eram 23% do registo em 2004–09 e são 9,5% hoje;
o resto são alterações, três a quatro vezes menos consensuais (18,0% contra 71,3% no T6).
Sobre todas as votações a linha cairia 30,2 → 9,8 e seria impossível separar a câmara do
estenógrafo. O conjunto das finais é estável: 7,0 · 14,2 · 5,7 · 7,1 · 5,1 por dia de sessão.

### 5. Quanto mais dividida a câmara, mais o PPE decide
% das votações decididas em que a maioria do grupo ficou do lado vencedor.

| | 2004–09 | 2009–14 | 2014–19 | 2019–24 | 2024–26 |
|---|---|---|---|---|---|
| PPE | 87,5 | 90,6 | 85,2 | 83,9 | **93,7** |
| liberais | 87,4 | 84,8 | 88,4 | 93,4 | 90,7 |
| socialistas | 82,4 | 83,3 | 86,8 | 88,5 | 85,3 |
| Verdes | 60,3 | 67,6 | 65,7 | 76,2 | 73,8 |
| esquerda radical | 52,3 | 51,8 | 53,1 | 65,1 | 59,5 |
| conservadores | 77,0 | 52,7 | 61,1 | 53,1 | **50,4** |
| direita radical | 45,1 | 53,6 | 35,7 | 39,8 | **34,6** |

Das 5 567 votações decididas deste mandato, só 348 se ganharam sem o PPE.
Por grupo, no último mandato: PPE 93,7 · Renew 90,7 · S&D 85,3 · Verts/ALE 73,8 ·
The Left 59,5 · ECR 50,4 · PfE 38,1 · ESN 31,1.

### 6. O eixo do Parlamento mudou de pontas — e ficou só um
MDS clássico sobre a matriz de concordâncias entre grupos. Determinístico, portanto os
cinco mandatos comparam-se de verdade — ao contrário das redes.

| mandato | grupos, da esquerda para a direita do eixo | 1 eixo | 2 eixos |
|---|---|---|---|
| 2004–09 | GUE/NGL −0,29 · Verts −0,26 · PSE −0,08 · ALDE +0,07 · IND/DEM +0,13 · UEN +0,19 · PPE-DE +0,23 | 48% | 83% |
| 2009–14 | Verts −0,25 · GUE/NGL −0,20 · S&D −0,17 · ALDE −0,04 · PPE +0,05 · EFD +0,27 · ECR +0,33 | 55% | 83% |
| 2014–19 | S&D −0,23 · ALDE −0,20 · PPE −0,16 · Verts −0,15 · GUE/NGL −0,01 · ECR +0,08 · EFDD +0,28 · ENF +0,39 | 49% | 88% |
| 2019–24 | GUE/NGL −0,26 · Verts −0,25 · S&D −0,17 · RE −0,08 · PPE +0,06 · ECR +0,33 · ID +0,36 | 75% | 94% |
| 2024–26 | Verts −0,35 · GUE/NGL −0,32 · S&D −0,27 · RE −0,20 · PPE −0,09 · ECR +0,34 · PfE +0,42 · ESN +0,47 | 85% | **98%** |

Três coisas: a amplitude do eixo passa de 0,52 para 0,82; uma linha só explicava 48% do
que se passava e passa a explicar 85%; e o maior intervalo entre dois grupos vizinhos sai
de dentro da esquerda para o vão **entre o PPE e o ECR**, onde sozinho vale metade do eixo
inteiro. É o cordão sanitário, medido.

### 7. Vinte e um pares, e a fronteira cai toda no mesmo sítio
Sete famílias fazem 21 pares. Os sete gráficos que se poderiam desenhar — um por família,
cada uma contra as outras seis — mostram cada par **duas** vezes; sem a repetição, o
conjunto inteiro cabe num só. Ordenados pela deslocação de 2004–09 para 2024–26:

| par | 2004–09 | 2009–14 | 2014–19 | 2019–24 | 2024–26 | desloc. |
|---|---|---|---|---|---|---|
| conservadores ~ direita radical | 53,9 | 66,4 | 53,9 | 72,3 | **77,9** | **+24,0** |
| Verdes ~ PPE | 48,7 | 59,5 | 55,4 | 62,4 | **68,7** | +20,0 |
| Verdes ~ liberais | 61,4 | 67,2 | 65,6 | 76,0 | **79,9** | +18,5 |
| Verdes ~ socialistas | 70,4 | 75,8 | 78,0 | 84,4 | **87,1** | +16,7 |
| esquerda radical ~ liberais | 52,8 | 53,1 | 53,9 | 66,0 | **65,8** | +13,0 |
| socialistas ~ liberais | 74,4 | 76,0 | 78,6 | 83,9 | **87,3** | +12,9 |
| esquerda radical ~ PPE | 43,0 | 48,3 | 44,0 | 53,1 | **54,8** | +11,8 |
| socialistas ~ PPE | 66,6 | 72,1 | 73,3 | 72,8 | **77,9** | +11,3 |
| esquerda radical ~ socialistas | 64,5 | 62,4 | 65,9 | 75,1 | **74,6** | +10,1 |
| liberais ~ PPE | 74,6 | 75,7 | 80,7 | 79,1 | **83,9** | +9,3 |
| esquerda radical ~ Verdes | 77,1 | 73,3 | 81,7 | 84,9 | **85,0** | +7,9 |
| PPE ~ direita radical | 51,2 | 56,2 | 41,3 | 55,1 | **40,6** | −10,6 |
| liberais ~ direita radical | 47,1 | 51,1 | 41,0 | 46,3 | **31,6** | −15,5 |
| socialistas ~ direita radical | 43,1 | 47,5 | 40,8 | 41,8 | **26,2** | −16,9 |
| PPE ~ conservadores | 74,9 | 59,6 | 69,7 | 66,9 | **57,3** | −17,6 |
| Verdes ~ conservadores | 50,3 | 39,8 | 43,3 | 41,0 | **31,4** | −18,9 |
| socialistas ~ conservadores | 62,3 | 45,1 | 54,3 | 49,5 | **40,3** | −22,0 |
| liberais ~ conservadores | 68,9 | 56,2 | 63,2 | 56,4 | **46,8** | −22,1 |
| esquerda radical ~ conservadores | 47,9 | 41,4 | 39,0 | 36,0 | **24,9** | −23,0 |
| Verdes ~ direita radical | 43,8 | 44,2 | 45,1 | 36,2 | **20,1** | −23,7 |
| esquerda radical ~ direita radical | 47,4 | 47,9 | 51,6 | 37,9 | **23,0** | −24,4 |

**Dez, dez e um, sem uma única excepção.** Os dez pares formados entre a esquerda radical,
os Verdes, os socialistas, os liberais e o PPE sobem todos. Os dez que envolvem os
conservadores ou a direita radical descem todos. Sobra o par que liga esses dois um ao
outro, e é a maior deslocação da câmara em vinte anos. A fronteira entre o verde e o
vermelho no gráfico não foi desenhada: sai da ordenação sozinha, e cai exactamente onde
está a fronteira política.

Isto é a versão completa do gráfico 2, que conta a mesma história com três linhas
escolhidas à mão. Na parede, provavelmente substitui-o.

**Atenção: é o sentido da viagem, não um corte no nível.** O PPE continua hoje mais perto
dos conservadores (57,3) do que da esquerda radical (54,8) — o par que desceu 17,6 pontos
ainda está acima do par que subiu 11,8. Não dizer que «as duas metades da câmara já não se
falam»: o que se partiu em dois foi a direcção do movimento.

**Nota de aritmética.** A deslocação é a diferença entre os dois valores impressos, à
casa decimal a que estão impressos, para que quem subtraia as pontas na parede obtenha o
número da coluna. Calculada sobre os valores completos, nove dos 21 pares mudam uma
décima — nenhum muda de sinal, e nenhuma conclusão depende disso.

### 8. Os mesmos vinte e um, na ordem em que se sentam
A matriz triangular: uma célula por par, famílias nos dois eixos pela ordem de assento,
e dentro de cada célula os cinco mandatos de cima para baixo. O vermelho não anda
espalhado — ocupa as duas últimas linhas, conservadores e direita radical, e mais nada;
a única célula verde nessas duas linhas é a que as liga uma à outra.

O que esta forma tem e o gráfico 7 não: **um vaivém é um canto**. O PPE com a direita
radical sobe a 56,2, cai a 41,3, volta a 55,1 e acaba em 40,6 — numa seta isso são dois
círculos do lado errado da ponta, aqui é um zigue-zague. É a razão para as duas formas
existirem.

### 9. Os arcos
Sem um número. Sete famílias na ordem de assento; o que subiu arqueia por cima da linha,
o que desceu por baixo, e a grossura é a deslocação. Serve para abrir a secção, não para
consultar. **Se só couber um destes três na parede, deve ser o 7** — é o único que se lê
sem legenda e sem quem o explique.

---

## O que não vamos dizer

**«O Parlamento polarizou-se.»** A concordância média entre grupos anda aos saltos —
58,3 · 58,0 · 55,6 · 60,8 · 53,2. Retirem-se os pares que envolvem um grupo de direita
radical e fica 62,5 · 60,4 · 63,1 · 65,8 · 64,4, plana se não a subir. A queda inteira é um
bloco a separar-se de uma câmara que, no resto, converge.

**«Hoje decide-se tudo por escassos votos.»** 7,5% hoje contra 9,1% em 2004–09. Menos.

**«Os grupos ficaram todos mais disciplinados.»** Só um ficou.

**«Há muito mais votações, logo trabalha-se mais.»** Passaram de ~1 200 por ano em 2004–09
para mais de 3 700 em 2019–24, mas é regimento e não política — mudou a regra sobre quando
se pede votação por chamada. Por isso tudo neste painel são percentagens.

---

## Séries de apoio, não usadas nos gráficos

- **Coesão das delegações nacionais** (média por país): 75,3 · 75,0 · 72,6 · 74,0 · **69,2**.
  Enquanto os grupos apertam, os países soltam-se. Cuidado: o Reino Unido sai a meio do
  mandato de 2019–24 e a Croácia entra em 2013, por isso o conjunto de países não é o mesmo.
- **Unanimidade entre grupos** (todos os grupos do lado vencedor): 11,0 · 9,9 · 4,0 · 10,3
  · **2,4%**. Diz o mesmo que o gráfico 4 mas é confundida pelo número de grupos do mandato
  (7 ou 8) — preferir a versão por deputados.
- **Amplitude média da maioria:** 4,92 · 4,85 · 5,09 · 5,00 · 5,23 grupos vencedores, o que
  em fracção da casa é 70% · 69% · 64% · 71% · **65%**.
- **Votações nominais por ano civil completo** (média dos anos inteiros de cada mandato):
  2005–08 **1 245** · 2010–13 **721** · 2015–18 **2 208** · 2020–23 **4 153** · 2025 **2 891**.
  Totais por mandato: 5 838 · 4 360 · 11 286 · 18 827 · 5 568.
- **Deputados por mandato:** 678 · 727 · 708 · 700 · 703.

## Método

«Concordância» entre dois grupos é a percentagem de votações em que os dois tomaram a mesma
posição; entre dois deputados, a percentagem de votações em que votaram o mesmo — a mesma
medida que desenha as redes. «Disciplina» é a percentagem de deputados de um grupo que vota
com a maioria do seu grupo. Uma votação está «decidida» quando há votos a favor e contra
(nos cinco mandatos, todas estão).

As famílias políticas agregam os nomes que os grupos foram tendo: esquerda radical
(GUE/NGL, The Left), Verdes (Verts/ALE), socialistas (PSE, S&D), liberais (ALDE, RE/Renew),
PPE (PPE-DE, PPE), conservadores (UEN, ECR), direita radical (IND/DEM, EFD, EFDD, ENF, ID,
PfE, ESN). Nos mandatos com dois grupos de direita radical a linha é a média dos dois.

O mandato de 2024–26 ainda vai a meio (Julho de 2024 a Julho de 2026, 5 568 votações).
Todos os números que lhe dizem respeito são percentagens; um teste feito sobre a mesma
janela de 722 dias do mandato anterior devolveu os mesmos valores que o mandato inteiro.
