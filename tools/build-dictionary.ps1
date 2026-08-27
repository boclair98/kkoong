param(
    [Parameter(Mandatory = $true)]
    [string]$SourceYaml
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $projectRoot 'src/main/resources/words-ko.txt'
$words = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$currentPos = ''

foreach ($line in [IO.File]::ReadLines((Resolve-Path -LiteralPath $SourceYaml))) {
    if ($line.StartsWith('- pos: ')) {
        $currentPos = $line.Substring(7).Trim()
        continue
    }
    if (-not $line.StartsWith('  word: ') -or $currentPos -ne '명사') {
        continue
    }

    $word = $line.Substring(8).Trim().Trim("'")
    if ($word -match '^[가-힣]{2,4}$') {
        [void]$words.Add($word)
    }
}

$header = @(
    '# 세글자쿵 엄격 판정용 한국어 명사 목록'
    '# Source: spellcheck-ko/hunspell-dict-ko dict-ko-data.yaml'
    '# License: GNU General Public License v3.0 or later (dictionary data only)'
    '# Filter: Hangul-only nouns with 2–4 syllables; duplicates removed'
)
$ordered = @($words) | Sort-Object
[IO.File]::WriteAllLines($outputPath, @($header + $ordered), [Text.UTF8Encoding]::new($false))
Write-Output "Generated $($ordered.Count) strict Korean nouns at $outputPath"
