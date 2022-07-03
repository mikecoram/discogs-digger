import { existsSync, readFileSync, writeFileSync } from 'fs'
import got from 'got/dist/source'
import parse from 'node-html-parser'

const discogsBaseUrl = 'https://www.discogs.com'
const cachePath = 'cache'
const outPath = 'out'

async function buildHtmlForRelease(path: string): Promise<string> {
  const releaseUrl = `${discogsBaseUrl}${path}`
  const localCopyPath = `${cachePath}/${path.split('/')[2]}`

  if (!existsSync(localCopyPath)) {
    const res = await got(releaseUrl)
    writeFileSync(localCopyPath, res.body)
  }

  const releaseBody = parse(readFileSync(localCopyPath).toString())
  const releaseH1 = releaseBody.querySelector('h1')
  const artistName = releaseBody.querySelector('h1 > span > a')
  const tracklist = releaseBody.querySelectorAll('#release-tracklist > div > table > tbody > tr > td:nth-child(3) > span').map(t => t.text)

  if (releaseH1 == null || artistName == null) {
    throw new Error('invalid')
  }

  const headingHtml = `
    <h3>
      <a href="${discogsBaseUrl}${path}">${releaseH1.text}</a>
    </h3>
    <ul>
      ${tracklist.map(t => `<li>${t}</li>`).join('')}
    </ul>
  `

  const videos = releaseBody.querySelectorAll('#release-videos > div > ul > li > button').map(v => {
    const src = v.querySelector('img')?.getAttribute('src')
    const title = v.querySelector('div')

    if ((src == null) || (title == null)) {
      throw new Error('invalid')
    }

    return {
      id: src.split('/vi/')[1].split('/default.jpg')[0],
      title: title.text
    }
  })

  if (videos.length === 0) {
    return `
      ${headingHtml}
      <p>
        No videos found.
      </p>
    `
  }

  return `
    ${headingHtml}
    ${videos.map(({ id }) => `<iframe src="https://www.youtube.com/embed/${id}" width="640" height="320"></iframe>`).join('\n')}
  `
}

async function main(): Promise<void> {
  const artistSearchPath = process.argv[2]
  const localCopyPath = `${cachePath}${artistSearchPath}`

  if (!existsSync(localCopyPath)) {
    const res = await got(`${discogsBaseUrl}${artistSearchPath}`)
    writeFileSync(localCopyPath, res.body)
  }

  const artistBody = parse(readFileSync(localCopyPath).toString())
  const releasePaths = artistBody.querySelectorAll('tr.main > td.title > a').map(e => e.getAttribute('href') ?? '')
  const releaseHtml = await Promise.all(releasePaths.slice(0, 5).map(r => buildHtmlForRelease(r)))

  writeFileSync(`${outPath}/${artistSearchPath}.html`, `
    <html>
    <head></head>
    <body>
      ${releaseHtml.join('')}
    </body>
    </html>
  `)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
