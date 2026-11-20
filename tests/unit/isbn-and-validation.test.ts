import { describe, expect, it } from "vitest";
import { isValidIsbn, looksLikeIsbn, toIsbn13 } from "@/lib/isbn";
import { genresFromSubjects } from "@/lib/open-library";
import { bookInputSchema, parseCatalogQuery } from "@/lib/validation";

describe("ISBN helpers", () => {
  it("validates ISBN-13 and ISBN-10 checksums", () => {
    expect(isValidIsbn("9780441172719")).toBe(true);
    expect(isValidIsbn("978-0-441-17271-9")).toBe(true);
    expect(isValidIsbn("0441172717")).toBe(true);
    expect(isValidIsbn("9780441172710")).toBe(false);
  });

  it("converts ISBN-10 to ISBN-13", () => {
    expect(toIsbn13("0441172717")).toBe("9780441172719");
    expect(toIsbn13("080442957X")).toBe("9780804429573");
    expect(toIsbn13("not an isbn")).toBeNull();
  });

  it("recognises ISBN-shaped search input", () => {
    expect(looksLikeIsbn("978-0-441-17271-9")).toBe(true);
    expect(looksLikeIsbn("dune")).toBe(false);
  });
});

describe("book input validation", () => {
  it("normalises authors, genres and ISBN", () => {
    const parsed = bookInputSchema.parse({
      title: "  Dune ",
      authors: "Frank Herbert, ",
      isbn: "0441172717",
      genres: ["Science Fiction", "Classic", "Classic"],
      totalCopies: "2",
    });
    expect(parsed.title).toBe("Dune");
    expect(parsed.authors).toEqual(["Frank Herbert"]);
    expect(parsed.isbn).toBe("9780441172719");
    expect(parsed.genres).toEqual(["Science Fiction", "Classic"]);
    expect(parsed.totalCopies).toBe(2);
    expect(parsed.language).toBe("English");
  });

  it("rejects bad input with readable messages", () => {
    const result = bookInputSchema.safeParse({ title: "", authors: [], isbn: "123", totalCopies: -1 });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((issue) => issue.message) ?? [];
    expect(messages).toContain("Title is required");
    expect(messages).toContain("Add at least one author");
    expect(messages).toContain("That isn't a valid ISBN-10 or ISBN-13");
  });
});

describe("catalog query parsing", () => {
  it("parses URL params and ignores junk", () => {
    const query = parseCatalogQuery({ q: "circe", vibe: "1", maxPages: "300", sort: "bogus", yearFrom: "abc" });
    expect(query).toMatchObject({ q: "circe", vibe: true, maxPages: 300, sort: "relevance" });
    expect(query.yearFrom).toBeUndefined();
  });
});

describe("Open Library genre mapping", () => {
  it("maps subjects to a primary genre", () => {
    expect(genresFromSubjects(["Detective and mystery stories", "Japan"])[0]).toBe("Mystery");
    expect(genresFromSubjects(["Science fiction", "Space"])[0]).toBe("Science Fiction");
    expect(genresFromSubjects([])[0]).toBe("Literary Fiction");
  });
});
