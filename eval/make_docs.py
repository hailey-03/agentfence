"""시연·테스트용 PDF 생성 (PyMuPDF 필요, 서버에는 불필요).
숨은 공격 표식은 흰색 1pt로 심는다.
실행: pip install pymupdf && python -m eval.make_docs"""
import os

from eval.dataset import DOCS


def build(path, visible, hidden):
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 100), visible, fontsize=11, fontname="korea")
    if hidden:
        page.insert_text((72, 800), hidden, fontsize=1, color=(1, 1, 1))  # 흰색 1pt
    doc.save(path)


def main(out_dir="eval/datasets"):
    os.makedirs(out_dir, exist_ok=True)
    for d in DOCS:
        name = f"{d.id}_{d.kind}.pdf"
        build(os.path.join(out_dir, name), f"{d.visible}", d.hidden)
    print(f"{len(DOCS)}개 PDF 생성: {out_dir}  (공격은 흰색 1pt로 숨은 표식 포함)")


if __name__ == "__main__":
    main()
