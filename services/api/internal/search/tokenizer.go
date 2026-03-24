package search

import (
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

// ─── Transliteration Tables ─────────────────────────────

// Multi-char Latin→Cyrillic (longest first for greedy matching)
var latMulti = []struct{ lat, cyr string }{
	{"shch", "щ"}, {"zh", "ж"}, {"kh", "х"}, {"ts", "ц"},
	{"ch", "ч"}, {"sh", "ш"}, {"yu", "ю"}, {"ya", "я"},
	{"yo", "ё"}, {"ck", "к"},
}

var latSingle = map[byte]string{
	'a': "а", 'b': "б", 'v': "в", 'g': "г", 'd': "д", 'e': "е",
	'z': "з", 'i': "и", 'k': "к", 'l': "л", 'm': "м", 'n': "н",
	'o': "о", 'p': "п", 'r': "р", 's': "с", 't': "т", 'u': "у",
	'f': "ф", 'h': "х", 'y': "й", 'j': "дж", 'w': "в", 'x': "кс",
	'q': "к", 'c': "к",
}

var cyrToLat = map[rune]string{
	'а': "a", 'б': "b", 'в': "v", 'г': "g", 'д': "d", 'е': "e",
	'ё': "yo", 'ж': "zh", 'з': "z", 'и': "i", 'й': "y", 'к': "k",
	'л': "l", 'м': "m", 'н': "n", 'о': "o", 'п': "p", 'р': "r",
	'с': "s", 'т': "t", 'у': "u", 'ф': "f", 'х': "kh", 'ц': "ts",
	'ч': "ch", 'ш': "sh", 'щ': "shch", 'ъ': "", 'ы': "y", 'ь': "",
	'э': "e", 'ю': "yu", 'я': "ya",
}

// Keyboard layout: QWERTY → ЙЦУКЕН
var enToRuKbd = map[byte]rune{
	'q': 'й', 'w': 'ц', 'e': 'у', 'r': 'к', 't': 'е', 'y': 'н',
	'u': 'г', 'i': 'ш', 'o': 'щ', 'p': 'з', '[': 'х', ']': 'ъ',
	'a': 'ф', 's': 'ы', 'd': 'в', 'f': 'а', 'g': 'п', 'h': 'р',
	'j': 'о', 'k': 'л', 'l': 'д', ';': 'ж', '\'': 'э',
	'z': 'я', 'x': 'ч', 'c': 'с', 'v': 'м', 'b': 'и', 'n': 'т',
	'm': 'ь', ',': 'б', '.': 'ю', '/': '.', '`': 'ё',
}

var ruToEnKbd map[rune]byte

func init() {
	ruToEnKbd = make(map[rune]byte, len(enToRuKbd))
	for en, ru := range enToRuKbd {
		ruToEnKbd[ru] = en
	}
}

// ─── Synonym Groups ─────────────────────────────────────

// First element is canonical form
var synonymGroups = [][]string{
	{"кофе", "кофеин", "кофейный", "coffee", "caffeine"},
	{"сон", "спать", "засыпать", "засыпание", "бессонница", "сновидение", "sleep", "insomnia"},
	{"пароль", "password", "pass", "пасс", "credentials", "passwd", "пассворд"},
	{"адрес", "хост", "host", "сервер", "server", "ip", "айпи"},
	{"докер", "docker", "контейнер", "container"},
	{"база", "database", "бд", "db", "базаданных"},
	{"линукс", "linux", "убунту", "ubuntu", "дебиан", "debian"},
	{"гит", "git", "гитхаб", "github", "репозиторий", "repository", "repo", "репо"},
	{"питон", "python", "пайтон", "py"},
	{"джаваскрипт", "javascript", "js", "жс", "нода", "node", "nodejs"},
	{"сеть", "network", "сетевой", "нетворк", "vpn", "впн"},
	{"ключ", "key", "токен", "token", "апиключ", "apikey"},
	{"почта", "email", "mail", "мейл", "емейл", "письмо"},
	{"телефон", "phone", "номер", "мобильный", "смс", "sms"},
	{"деньги", "money", "оплата", "payment", "платёж", "платеж"},
	{"файл", "file", "документ", "document", "док"},
	{"картинка", "image", "фото", "photo", "изображение", "img", "pic"},
	{"ссылка", "link", "url", "урл", "линк"},
	{"настройка", "config", "конфиг", "configuration", "settings", "сеттинг"},
	{"ошибка", "error", "баг", "bug", "проблема", "problem", "issue"},
}

var synonymMap map[string]string

func init() {
	synonymMap = make(map[string]string, 200)
	for _, group := range synonymGroups {
		canonical := group[0]
		for _, word := range group {
			synonymMap[strings.ToLower(word)] = canonical
		}
	}
}

// ─── Helpers ────────────────────────────────────────────

var reLatinWord = regexp.MustCompile(`^[a-z]+$`)
var reCyrillicWord = regexp.MustCompile(`^[\x{0400}-\x{04ff}]+$`)
var reWordExtract = regexp.MustCompile(`[a-zA-Z\x{0400}-\x{04ff}0-9]{2,}`)

const stemLen = 5

func isLatin(w string) bool  { return reLatinWord.MatchString(w) }
func isCyrillic(w string) bool { return reCyrillicWord.MatchString(w) }

func toCyrillic(word string) string {
	w := strings.ToLower(word)
	var out strings.Builder
	i := 0
	for i < len(w) {
		matched := false
		// Try multi-char (longest first)
		for _, m := range latMulti {
			if strings.HasPrefix(w[i:], m.lat) {
				out.WriteString(m.cyr)
				i += len(m.lat)
				matched = true
				break
			}
		}
		if !matched {
			if cyr, ok := latSingle[w[i]]; ok {
				out.WriteString(cyr)
			} else {
				out.WriteByte(w[i])
			}
			i++
		}
	}
	return out.String()
}

func toLatin(word string) string {
	w := strings.ToLower(word)
	var out strings.Builder
	for _, r := range w {
		if lat, ok := cyrToLat[r]; ok {
			out.WriteString(lat)
		} else {
			out.WriteRune(r)
		}
	}
	return out.String()
}

func kbdToRussian(word string) string {
	var out strings.Builder
	for i := 0; i < len(word); i++ {
		if ru, ok := enToRuKbd[word[i]]; ok {
			out.WriteRune(ru)
		} else {
			out.WriteByte(word[i])
		}
	}
	return out.String()
}

func kbdToEnglish(word string) string {
	var out strings.Builder
	for _, r := range word {
		if en, ok := ruToEnKbd[r]; ok {
			out.WriteByte(en)
		} else {
			out.WriteRune(r)
		}
	}
	return out.String()
}

// ─── Fuzzy Matching ─────────────────────────────────────

func trigrams(word string) []string {
	runes := []rune("_" + word + "_")
	if len(runes) < 3 {
		return []string{word}
	}
	result := make([]string, 0, len(runes)-2)
	for i := 0; i <= len(runes)-3; i++ {
		result = append(result, string(runes[i:i+3]))
	}
	return result
}

func sortedChars(word string) string {
	runes := []rune(word)
	sort.Slice(runes, func(i, j int) bool { return runes[i] < runes[j] })
	return string(runes)
}

func deletionVariants(word string) []string {
	runes := []rune(word)
	if len(runes) <= 2 {
		return nil
	}
	result := make([]string, len(runes))
	for i := range runes {
		result[i] = string(append(append([]rune{}, runes[:i]...), runes[i+1:]...))
	}
	return result
}

func transpositionVariants(word string) []string {
	runes := []rune(word)
	if len(runes) <= 1 {
		return nil
	}
	var result []string
	for i := 0; i < len(runes)-1; i++ {
		swapped := make([]rune, len(runes))
		copy(swapped, runes)
		swapped[i], swapped[i+1] = swapped[i+1], swapped[i]
		s := string(swapped)
		if s != word {
			result = append(result, s)
		}
	}
	return result
}

// ─── Normalization Pipeline ─────────────────────────────

func normalizeWordInner(word string) []string {
	tokens := make(map[string]struct{})
	w := strings.ToLower(word)

	// Synonym
	if canon, ok := synonymMap[w]; ok {
		tokens[canon] = struct{}{}
	}

	// Transliteration + synonym
	if isLatin(w) {
		cyr := toCyrillic(w)
		if canon, ok := synonymMap[cyr]; ok {
			tokens[canon] = struct{}{}
		}
		if _, exists := tokens[cyr]; !exists {
			tokens[runePrefix(cyr, stemLen)] = struct{}{}
		}
	} else if isCyrillic(w) {
		lat := toLatin(w)
		if canon, ok := synonymMap[lat]; ok {
			tokens[canon] = struct{}{}
		}
		if _, exists := tokens[lat]; !exists {
			tokens[runePrefix(lat, stemLen)] = struct{}{}
		}
	}

	// Prefix stem
	tokens[runePrefix(w, stemLen)] = struct{}{}

	// Full word for exact match
	if utf8.RuneCountInString(w) >= 3 {
		tokens[w] = struct{}{}
	}

	return mapKeys(tokens)
}

func normalizeWord(word string) []string {
	tokens := make(map[string]struct{})
	w := strings.ToLower(word)

	// 1. Direct synonym
	if canon, ok := synonymMap[w]; ok {
		tokens[canon] = struct{}{}
	}

	// 2. Keyboard layout recovery
	if isLatin(w) {
		ru := kbdToRussian(w)
		for _, t := range normalizeWordInner(ru) {
			tokens[t] = struct{}{}
		}
	} else if isCyrillic(w) {
		en := kbdToEnglish(w)
		for _, t := range normalizeWordInner(en) {
			tokens[t] = struct{}{}
		}
	}

	// 3. Transliteration + synonym
	if isLatin(w) {
		cyr := toCyrillic(w)
		if canon, ok := synonymMap[cyr]; ok {
			tokens[canon] = struct{}{}
		}
		if cyr != w {
			tokens[runePrefix(cyr, stemLen)] = struct{}{}
		}
	} else if isCyrillic(w) {
		lat := toLatin(w)
		if canon, ok := synonymMap[lat]; ok {
			tokens[canon] = struct{}{}
		}
		if lat != w {
			tokens[runePrefix(lat, stemLen)] = struct{}{}
		}
	}

	// 4. Prefix stem
	tokens[runePrefix(w, stemLen)] = struct{}{}

	// 5. Full word
	if utf8.RuneCountInString(w) >= 3 {
		tokens[w] = struct{}{}
	}

	// 6. Fuzzy tokens
	if utf8.RuneCountInString(w) >= 2 {
		tokens["="+sortedChars(w)] = struct{}{}
	}
	for _, d := range deletionVariants(w) {
		tokens["-"+d] = struct{}{}
	}

	// 7. Transposition synonym check
	for _, tv := range transpositionVariants(w) {
		if canon, ok := synonymMap[tv]; ok {
			tokens[canon] = struct{}{}
		}
	}

	return mapKeys(tokens)
}

// Tokenize splits text into normalized search tokens
func Tokenize(text string) []string {
	words := reWordExtract.FindAllString(strings.ToLower(text), -1)
	var tokens []string
	for _, word := range words {
		// Normalized word tokens
		tokens = append(tokens, normalizeWord(word)...)
		// Character trigrams (prefixed with ~)
		for _, tri := range trigrams(word) {
			tokens = append(tokens, "~"+tri)
		}
	}
	return tokens
}

// ─── Utility ────────────────────────────────────────────

func runePrefix(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n])
}

func mapKeys(m map[string]struct{}) []string {
	result := make([]string, 0, len(m))
	for k := range m {
		result = append(result, k)
	}
	return result
}
