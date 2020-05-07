import * as config from "../src/config";
import {
	DefaultOctokit,
	filterReposByPatterns,
	listAllMatchingRepos,
	publicKeyCache,
	setSecretForRepo,
} from "../src/github";

// @ts-ignore-next-line
import fixture from "@octokit/fixtures/scenarios/api.github.com/get-repository/normalized-fixture.json";
import nock from "nock";

let octokit: any;

beforeAll(() => {
	nock.disableNetConnect();
	(config.getConfig as jest.Mock) = jest.fn().mockReturnValue({
		GITHUB_TOKEN: "token",
		FILES: ["BAZ"],
		REPOSITORIES: [".*"],
		REPOSITORIES_LIST_REGEX: true,
		DRY_RUN: false,
		RETRIES: 3,
	});

	octokit = DefaultOctokit({
		auth: "",
	});
});

afterAll(() => {
	nock.enableNetConnect();
});

describe("listing repos from github", () => {
	const pageSize = 2;
	beforeEach(() => {
		nock("https://api.github.com")
			.get(/\/user\/repos?.*page=1.*/)
			.reply(200, [fixture[0].response, fixture[0].response]);

		nock("https://api.github.com")
			.get(/\/user\/repos?.*page=2.*/)
			.reply(200, [fixture[0].response]);
	});

	test("listAllReposForAuthenticatedUser returns from multiple pages", async () => {
		const repos = await listAllMatchingRepos({
			patterns: [".*"],
			octokit,
			pageSize,
		});

		expect(repos.length).toEqual(3);
	});

	test("listAllReposForAuthenticatedUser matches patterns", async () => {
		const repos = await listAllMatchingRepos({
			patterns: ["octokit.*"],
			octokit,
			pageSize,
		});

		expect(repos.length).toEqual(3);
	});
});

test("filterReposByPatterns matches patterns", async () => {
	expect(filterReposByPatterns([fixture[0].response], [".*"]).length).toBe(1);
	expect(filterReposByPatterns([fixture[0].response], ["nope"]).length).toBe(0);
});

describe("setSecretForRepo", () => {
	const repo = fixture[0].response;
	const publicKey = {
		key_id: "1234",
		key: "HRkzRZD1+duhfvNvY8eiCPb+ihIjbvkvRyiehJCs8Vc=",
	};

	jest.setTimeout(30000);

	const secrets = { FOO: "BAR" };

	let publicKeyMock: nock.Scope;
	let setSecretMock: nock.Scope;

	beforeEach(() => {
		nock.cleanAll();
		publicKeyCache.clear();
		publicKeyMock = nock("https://api.github.com")
			.get(`/repos/${repo.full_name}/actions/secrets/public-key`)
			.reply(200, publicKey);
		setSecretMock = nock("https://api.github.com")
			.put(`/repos/${repo.full_name}/actions/secrets/FOO`, (body) => {
				expect(body.encrypted_value).toBeTruthy();
				expect(body.key_id).toEqual(publicKey.key_id);
				return body;
			})
			.reply(200);
	});

	test("setSecretForRepo should retrieve public key", async () => {
		await setSecretForRepo(octokit, "FOO", secrets.FOO, repo, true);
		expect(publicKeyMock.isDone()).toBeTruthy();
	});

	test("setSecretForRepo should not set secret with dry run", async () => {
		await setSecretForRepo(octokit, "FOO", secrets.FOO, repo, true);
		expect(publicKeyMock.isDone()).toBeTruthy();
		expect(setSecretMock.isDone()).toBeFalsy();
	});

	test("setSecretForRepo should should call set secret endpoint", async () => {
		await setSecretForRepo(octokit, "FOO", secrets.FOO, repo, false);
		expect(nock.isDone()).toBeTruthy();
	});
});
