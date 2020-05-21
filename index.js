import PDFJS from "pdfjs-dist";
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

(async () => {
    try {
        const images = await getPdfImages("http://build-redesign.thebdxlive.com/api/cors/file?contentType=application%2Fpdf&url=http%3A%2F%2Fbuild1.thebdxlive.com%2FNHSPro%2FPromos%2Ffile-example_PDF_1MB_70a8e28c-9d76-4e34-a049-54819bcc7063.pdf");
        images.forEach(image => document.body.appendChild(image));
    } catch {
        console.log("Unable to download pdf")
    }
    
    const fileInput = document.querySelector('input');
    fileInput.addEventListener('change', ({
        target
    }) => {
        const file = target.files[0];

        var reader = new FileReader();
        reader.onload = async ({
            target: {
                result
            }
        }) => {
            const images = await getPdfImages(result);
            images.forEach(image => document.body.appendChild(image));
        }
        reader.readAsArrayBuffer(target.files[0]);
    })
})()

async function getPdfImages(src) {
    const pdf = await pdfRef(src);
    const images = await pdfImages(pdf);
    return images;
}

async function pdfRef(src) {
    PDFJS.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    const loadingTask = PDFJS.getDocument(src);
    const pdf = await loadingTask.promise;
    return pdf;
}

async function pdfImages(pdf) {
    const pages = [];
    const pdfImagesSet = [];
    for (let i = pdf.numPages; i !== 0; i--) {
        /**
         * Get the page
         */
        pages.push(pdfPageImages(pdf.getPage(i), pdfImagesSet));
    }
    return Promise.all(pages).then(() => pdfImagesSet);
}

async function pdfPageImages(pagePromise, refSet) {
    const page = await pagePromise;
    /**
     * Get operators
     */
    await page.getOperatorList();
    /**
     * Get the objs on the page
     */
    Object.values(page.objs._objs).forEach(({
        data: imageData
    }) => {
        if (imageData instanceof HTMLImageElement) {
            refSet.push(imageData)
        }
        if (imageData && imageData.data instanceof Uint8ClampedArray) {
            try {
                refSet.push(imageDataToImage(imageData));
            } catch (err) {
                console.log(err, imageData);
            }
        }
    });
}


function imageDataToImage(imageData) {
    var canvas = document.createElement('canvas');
    canvas.height = imageData.height;
    canvas.width = imageData.width;
    var ctx = canvas.getContext('2d');
    putBinaryImageData(ctx, imageData)
    var image = new Image();
    image.src = canvas.toDataURL();
    return image;
}


var FULL_CHUNK_HEIGHT = 16;
var ImageKind = {
    GRAYSCALE_1BPP: 1,
    RGB_24BPP: 2,
    RGBA_32BPP: 3
};

function isLittleEndian() {
    var buffer8 = new Uint8Array(4);
    buffer8[0] = 1;
    var view32 = new Uint32Array(buffer8.buffer, 0, 1);
    return view32[0] === 1;
}

function putBinaryImageData(ctx, imgData) {
    if (typeof ImageData !== 'undefined' && imgData instanceof ImageData) {
        ctx.putImageData(imgData, 0, 0);
        return;
    }

    var height = imgData.height,
        width = imgData.width;
    var partialChunkHeight = height % FULL_CHUNK_HEIGHT;
    var fullChunks = (height - partialChunkHeight) / FULL_CHUNK_HEIGHT;
    var totalChunks = partialChunkHeight === 0 ? fullChunks : fullChunks + 1;
    var chunkImgData = ctx.createImageData(width, FULL_CHUNK_HEIGHT);
    var srcPos = 0,
        destPos;
    var src = imgData.data;
    var dest = chunkImgData.data;
    var i, j, thisChunkHeight, elemsInThisChunk;

    if (imgData.kind === ImageKind.GRAYSCALE_1BPP) {
        var srcLength = src.byteLength;
        var dest32 = new Uint32Array(dest.buffer, 0, dest.byteLength >> 2);
        var dest32DataLength = dest32.length;
        var fullSrcDiff = width + 7 >> 3;
        var white = 0xFFFFFFFF;
        var black = isLittleEndian() ? 0xFF000000 : 0x000000FF;

        for (i = 0; i < totalChunks; i++) {
            thisChunkHeight = i < fullChunks ? FULL_CHUNK_HEIGHT : partialChunkHeight;
            destPos = 0;

            for (j = 0; j < thisChunkHeight; j++) {
                var srcDiff = srcLength - srcPos;
                var k = 0;
                var kEnd = srcDiff > fullSrcDiff ? width : srcDiff * 8 - 7;
                var kEndUnrolled = kEnd & ~7;
                var mask = 0;
                var srcByte = 0;

                for (; k < kEndUnrolled; k += 8) {
                    srcByte = src[srcPos++];
                    dest32[destPos++] = srcByte & 128 ? white : black;
                    dest32[destPos++] = srcByte & 64 ? white : black;
                    dest32[destPos++] = srcByte & 32 ? white : black;
                    dest32[destPos++] = srcByte & 16 ? white : black;
                    dest32[destPos++] = srcByte & 8 ? white : black;
                    dest32[destPos++] = srcByte & 4 ? white : black;
                    dest32[destPos++] = srcByte & 2 ? white : black;
                    dest32[destPos++] = srcByte & 1 ? white : black;
                }

                for (; k < kEnd; k++) {
                    if (mask === 0) {
                        srcByte = src[srcPos++];
                        mask = 128;
                    }

                    dest32[destPos++] = srcByte & mask ? white : black;
                    mask >>= 1;
                }
            }

            while (destPos < dest32DataLength) {
                dest32[destPos++] = 0;
            }

            ctx.putImageData(chunkImgData, 0, i * FULL_CHUNK_HEIGHT);
        }
    } else if (imgData.kind === ImageKind.RGBA_32BPP) {
        j = 0;
        elemsInThisChunk = width * FULL_CHUNK_HEIGHT * 4;

        for (i = 0; i < fullChunks; i++) {
            dest.set(src.subarray(srcPos, srcPos + elemsInThisChunk));
            srcPos += elemsInThisChunk;
            ctx.putImageData(chunkImgData, 0, j);
            j += FULL_CHUNK_HEIGHT;
        }

        if (i < totalChunks) {
            elemsInThisChunk = width * partialChunkHeight * 4;
            dest.set(src.subarray(srcPos, srcPos + elemsInThisChunk));
            ctx.putImageData(chunkImgData, 0, j);
        }
    } else if (imgData.kind === ImageKind.RGB_24BPP) {
        thisChunkHeight = FULL_CHUNK_HEIGHT;
        elemsInThisChunk = width * thisChunkHeight;

        for (i = 0; i < totalChunks; i++) {
            if (i >= fullChunks) {
                thisChunkHeight = partialChunkHeight;
                elemsInThisChunk = width * thisChunkHeight;
            }

            destPos = 0;

            for (j = elemsInThisChunk; j--;) {
                dest[destPos++] = src[srcPos++];
                dest[destPos++] = src[srcPos++];
                dest[destPos++] = src[srcPos++];
                dest[destPos++] = 255;
            }

            ctx.putImageData(chunkImgData, 0, i * FULL_CHUNK_HEIGHT);
        }
    } else {
        throw new Error("bad image kind: ".concat(imgData.kind));
    }
}