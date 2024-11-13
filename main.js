const v_shader = `#version 300 es

in vec4 a_vertex_position;

void main()
{
    gl_Position = a_vertex_position;
}`;
const f_shader = `#version 300 es

precision mediump float;

// the fact that shaders have no exceptions or any way to debug them
// is INSANE, who designs garbage like this? why r we ok with this?
// but muh performance!!! consider this: debug and release profiles :ooooo

out vec4 frag_color;

const ivec2 CANVAS_DIMENSIONS = ivec2(640, 640);

const int SPHERES_AMOUNT = 10; //COPY TO JS

const int BOUNCE_COUNT = 15;

uniform vec3 spheres_pos[SPHERES_AMOUNT];
uniform float spheres_size[SPHERES_AMOUNT];
uniform vec3 spheres_color[SPHERES_AMOUNT];
uniform float spheres_luminance[SPHERES_AMOUNT];
uniform float spheres_smoothness[SPHERES_AMOUNT];

uniform vec3 camera_pos;
uniform vec3 camera_forward_n;
uniform vec3 camera_right_n;
uniform vec3 camera_up_n;

uniform uint frame_seed;

const vec3 topmax_background_color = vec3(0.8, 0.8, 1.0);
const vec3 topmin_background_color = vec3(0.6, 0.6, 0.8);

const float camera_fov = 0.3;
const float camera_focus = 0.15;

const float background_luminance = 0.15;

const float PI = 3.1415926535897932384626433832795;


const float MEAN = 0.0;
const float SD = 1.0;

uint random_u32(uint x)
{
    x ^= x >> 16;
    x *= 0x21f0aaadu;
    x ^= x >> 15;
    x *= 0x735a2d97u;
    x ^= x >> 15;

    return x;
}

uint squares_random(uint seed_raw, inout uint w, inout uint current)
{
    uint seed = seed_raw | 0x80000001u;

    w += seed;

    current = (current * current) + w;
    current = (current >> 16) | (current << 16);

    return current;
}

float uniform_random(inout uint seed)
{
    seed = seed * 747796405u + 2891336453u;
    seed = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;

    return float(seed) / 4294967295.0;
}

float gauss_random(inout uint seed)
{
    float theta = 2.0 * PI * uniform_random(seed);
    float dist = sqrt(-2.0 * log(1.0 - uniform_random(seed)));

    return MEAN + dist * cos(theta);
}

vec3 direction_random(inout uint seed)
{
    return normalize(vec3(gauss_random(seed), gauss_random(seed), gauss_random(seed)));
}

vec3 background_color(vec3 dir)
{
    float a = 1.0 + dir.y * 8.0;

    return mix(topmin_background_color, topmax_background_color, a);
}

struct RayInfo
{
    bool intersected;
    vec3 color;
    vec3 point;
    vec3 normal;
    float luminance;
    float smoothness;
};

RayInfo raycast(vec3 pos, vec3 dir)
{
    RayInfo ray;
    ray.intersected = false;

    float closest_sphere;
    for(int i = 0; i < SPHERES_AMOUNT; ++i)
    {
        vec3 sphere_pos = spheres_pos[i];
        float sphere_radius = spheres_size[i];

        vec3 sphere_offset = pos - sphere_pos;

	float left_sqrt = dot(dir, sphere_offset);
	float left = left_sqrt * left_sqrt;

	float right = dot(sphere_offset, sphere_offset) - (sphere_radius * sphere_radius);

	float nabla = left - right;

        bool sphere_intersected = nabla >= 0.0;

        if (sphere_intersected)
        {
	    float nabla_sqrt = sqrt(nabla);
	    float d = -dot(dir, sphere_offset);

	    float first = d + nabla_sqrt;
	    float second = d - nabla_sqrt;

            float hit_distance = min(first, second);

            bool closer = !ray.intersected || (hit_distance < closest_sphere);
            bool visible = (hit_distance >= 0.0) && closer;

            if (visible)
            {
                closest_sphere = hit_distance;

                vec3 hit_point = pos + dir * hit_distance;

                vec3 hit_normal = normalize(hit_point - sphere_pos);

                ray.intersected = true;
                ray.point = hit_point;
                ray.normal = hit_normal;
                ray.color = spheres_color[i];
                ray.luminance = spheres_luminance[i];
                ray.smoothness = spheres_smoothness[i];
            }
        }
    }

    return ray;
}

vec3 trace(vec3 pos, vec3 dir, inout uint seed)
{
    vec3 illuminated_color = vec3(0.0);
    vec3 total_color = vec3(1.0);

    for(int i = 0; i < BOUNCE_COUNT; ++i)
    {
        RayInfo ray = raycast(pos, dir);

        if (ray.intersected)
        {
            total_color *= ray.color;
            illuminated_color += ray.luminance * total_color;

            pos = ray.point;

            vec3 diffuse_dir = normalize(ray.normal + direction_random(seed));
            vec3 specular_dir = reflect(dir, ray.normal);

            dir = mix(diffuse_dir, specular_dir, ray.smoothness);
        } else
        {
            total_color *= background_color(dir);
            illuminated_color += background_luminance * total_color;
            break;
        }
    }

    return illuminated_color;
}

vec3 pixel_at(vec2 pixel, uint seed)
{
    vec3 origin = camera_pos;

    vec2 center_offset = pixel - 0.5;

    vec3 target = center_offset.x * camera_right_n * camera_fov
      + center_offset.y * camera_up_n * camera_fov
      + camera_forward_n * camera_focus;

    vec3 direction = normalize(target);

    return trace(origin, direction, seed);
}

void main()
{
    vec2 pixel = gl_FragCoord.xy / vec2(CANVAS_DIMENSIONS);
    uint pixel_index = uint(gl_FragCoord.y) * uint(CANVAS_DIMENSIONS.x) + uint(gl_FragCoord.x);
    uint seed = random_u32(pixel_index);

    const uint RAYS_PER_PIXEL = 16u;

    vec3 color = vec3(0.0);
    for(uint i = 0u; i < RAYS_PER_PIXEL; ++i)
    {
        uint i_seed = random_u32(i);
        uint seed_inner = squares_random(frame_seed, seed, i_seed);
        color += pixel_at(pixel, seed_inner);
    }

    frag_color = vec4(color / float(RAYS_PER_PIXEL), 1.0);
}`;
const SPHERES_AMOUNT = 10; //COPY TO JS
const canvas = new OffscreenCanvas(640, 640);
const gl = canvas.getContext("webgl2");

const display_canvas = document.getElementById("display_canvas");
const display_context = display_canvas.getContext("2d");

const frame_counter_element = document.getElementById("frame_counter");

let spheres_pos = [];
let spheres_size = [];
let spheres_color = [];
let spheres_luminance = [];
let spheres_smoothness = [];

let camera_pos = [0.0, 0.5, -0.4];
let camera_forward = [0.0, 0.0, 1.0];

let program_info = null;

let rendered_image = null;

let previous_frame_time = 0.0;

let frame_index = 0;
let max_rays = 100;

let keys_pressed = {
    forward: false,
    back: false,
    left: false,
    right: false,
    up: false,
    down: false
};

document.addEventListener("DOMContentLoaded", main);
document.addEventListener("keydown", on_key_down);
document.addEventListener("keyup", on_key_up);

function main()
{
    if (gl === null)
    {
        alert("nyo opengl im so sowy 😭");
        return;
    } else
    {
        initialize_scene();
    }
}

function increase_max()
{
    max_rays = max_rays * 2;
}

function mix_frame()
{
    const width = canvas.width;
    const height = canvas.height;

    const total_size = width * height * 4;

    let canvas_image = new Uint8ClampedArray(total_size);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, canvas_image);

    if (rendered_image === null)
    {
        rendered_image = canvas_image;
    } else
    {
        const next_frame = frame_index + 1;
        for(let i = 0; i < total_size; ++i)
        {
            const mixed_pixel =
                rendered_image[i] * (frame_index / next_frame) + canvas_image[i] / next_frame;

            rendered_image[i] = mixed_pixel;

            canvas_image[i] = mixed_pixel;
        }
    }

    const canvas_data = new ImageData(canvas_image, width, height);
    display_context.putImageData(canvas_data, 0, 0);
}

function bind_per_frame_uniforms()
{
    gl.uniform1ui(program_info.uniform_locations.frame_seed, Math.random() * 4294967295);
}

function clear_rendered()
{
    rendered_image = null;
    frame_index = 0;
}

function array_add(a, b)
{
    return a.map((x, i) => x + b[i]);
}

function array_sub(a, b)
{
    return a.map((x, i) => x - b[i]);
}

function array_mul(a, s)
{
    return a.map((x) => x * s);
}

function array_div(a, s)
{
    return a.map((x) => x / s);
}

function array_negate(a)
{
    return a.map((x) => -x);
}

function cross_2d(a, b)
{
    return a[0] * b[1] - b[0] * a[1];
}

function cross_3d(a, b)
{
    return [
	cross_2d([a[1], a[2]], [b[1], b[2]]),
	cross_2d([a[2], a[0]], [b[2], b[0]]),
	cross_2d([a[0], a[1]], [b[0], b[1]])
    ];
}

function magnitude(a)
{
    return Math.sqrt(a.map((x) => x * x).reduce((acc, x) => acc + x, 0));
}

function normalize(a)
{
    return array_div(a, magnitude(a));
}

function is_normalized(a)
{
    return Math.abs(magnitude(a) - 1.0) < 0.001;
}

function create_basis(forward, other)
{
    if (!is_normalized(forward))
    {
	alert("forward vector isnt normalized in create_basis, fix that!");
    }

    if (!is_normalized(other))
    {
	alert("second vector isnt normalized in create_basis!!! bad!!");
    }

    const right_un = cross_3d(other, forward);

    if (magnitude(right_un) <= 0.0)
    {
	alert("forward and second vectors in create_basis must not be parallel, ITS OVER");
    }

    const right = normalize(right_un);
    const up = normalize(cross_3d(forward, right));

    return {
	forward,
	right,
	up
    }
}

function current_camera()
{
    return {
	position: camera_pos,
	basis: create_basis(camera_forward, [0.0, 1.0, 0.0])
    }
}

function camera_changed()
{
    bind_camera_uniforms(current_camera());
    clear_rendered();
}

function get_key_changer(e)
{
    switch (e.code)
    {
        case "KeyW":
	  return (x) => { keys_pressed.forward = x };

        case "KeyS":
	  return (x) => { keys_pressed.back = x };

        case "KeyA":
	  return (x) => { keys_pressed.left = x };

        case "KeyD":
	  return (x) => { keys_pressed.right = x };

	case "Space":
	  return (x) => { keys_pressed.up = x };

	case "KeyC":
	  return (x) => { keys_pressed.down = x };

	default:
	  return (_) => {};
    }
}

function on_key_down(e)
{
    get_key_changer(e)(true);
}

function on_key_up(e)
{
    get_key_changer(e)(false);
}

function movement_directions()
{
    const camera = current_camera().basis;

    const directions = [];

    if (keys_pressed.forward)
    {
	directions.push(camera.forward);
    }

    if (keys_pressed.back)
    {
	directions.push(array_negate(camera.forward));
    }

    if (keys_pressed.left)
    {
	directions.push(array_negate(camera.right));
    }

    if (keys_pressed.right)
    {
	directions.push(camera.right);
    }

    if (keys_pressed.up)
    {
	directions.push([0.0, 1.0, 0.0]);
    }

    if (keys_pressed.down)
    {
	directions.push([0.0, -1.0, 0.0]);
    }

    return directions;
}

function handle_inputs(dt)
{
    const directions = movement_directions(dt);

    if (directions.length === 0)
    {
	return;
    }

    const speed = 0.02 * dt;

    directions.forEach((direction) => { camera_pos = array_add(camera_pos, array_mul(direction, speed)); });

    camera_changed();
}

function draw_frame(current_time)
{
    const dt = Math.min(current_time - previous_frame_time, 0.5);
    previous_frame_time = current_time;

    handle_inputs(dt);

    if (frame_index < max_rays)
    {
	bind_per_frame_uniforms();

	//draw the rectangle with everything on it
	//0 offset 4 vertices
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

	mix_frame();

	frame_index += 1;

	const progress = (frame_index / max_rays) * 100.0;
	frame_counter_element.innerHTML = "progress: " + progress.toFixed(1) + "%";
    }

    requestAnimationFrame(draw_frame);
}

function random_sphere()
{
    const size = Math.random() * 0.15 + 0.05;

    const possible_colors = [{r: 140, g: 235, b: 255}, {r: 255, g: 109, b: 201}];
    const index = Math.floor(Math.random() * 2.0);

    const this_color = possible_colors[index];

    return {
        position: {
            x: (Math.random() - 0.5) * 1.5,
            y: size + (Math.random() - 0.2) * 0.09,
            z: Math.random() * 0.7 + 0.2
        },
        size: size,
        color: {
            r: Math.random(),
            g: Math.random(),
            b: Math.random()
        },
        // color: this_color,
        luminance: 0.0,
        smoothness: 0.05 + Math.random() * 0.9
    };
}

function initialize_spheres(amount)
{
    const spheres = [
        {
            position: {
                x: 0.0,
                y: -1000.0,
                z: 0.0
            },
            size: 1000.0,
            color: {
                r: 1.0,
                g: 1.0,
                b: 1.0
            },
            luminance: 0.0,
            smoothness: 0.0
        }
    ];

    const lights_amount = Math.ceil(Math.random() * 2.0);

    const random_amount = amount - spheres.length;
    for(let i = 0; i < random_amount; ++i)
    {
        let sphere = random_sphere();

        if (i < lights_amount)
        {
            //this one glows
            const c_color = sphere.color;
            const smallest_color = Math.min(Math.min(c_color.r, c_color.g), c_color.b);

            const max_factor = 1.0 / smallest_color;

            sphere.color = {
                r: sphere.color.r * max_factor,
                g: sphere.color.g * max_factor,
                b: sphere.color.b * max_factor
            };
            sphere.luminance = Math.random() * 20.0 + 10.0;
        }

        spheres.push(sphere);
    }

    for(let i = 0; i < spheres.length; ++i)
    {
        let sphere = spheres[i];

        spheres_pos.push(sphere.position.x);
        spheres_pos.push(sphere.position.y);
        spheres_pos.push(sphere.position.z);

        spheres_size.push(sphere.size);

        spheres_color.push(sphere.color.r);
        spheres_color.push(sphere.color.g);
        spheres_color.push(sphere.color.b);

        spheres_luminance.push(sphere.luminance);

        spheres_smoothness.push(sphere.smoothness);
    }
}

function bind_camera_uniforms(camera)
{
    gl.uniform3fv(program_info.uniform_locations.camera_pos, camera.position);

    gl.uniform3fv(program_info.uniform_locations.camera_forward_n, camera.basis.forward);
    gl.uniform3fv(program_info.uniform_locations.camera_right_n, camera.basis.right);
    gl.uniform3fv(program_info.uniform_locations.camera_up_n, camera.basis.up);
}

function bind_uniforms()
{
    if (program_info === null)
    {
        return null;
    }

    gl.uniform3fv(program_info.uniform_locations.spheres_pos, spheres_pos);
    gl.uniform1fv(program_info.uniform_locations.spheres_size, spheres_size);
    gl.uniform3fv(program_info.uniform_locations.spheres_color, spheres_color);
    gl.uniform1fv(program_info.uniform_locations.spheres_luminance, spheres_luminance);
    gl.uniform1fv(program_info.uniform_locations.spheres_smoothness, spheres_smoothness);

    bind_camera_uniforms(current_camera());
}

function initialize_scene()
{
    program_info = attributes_info();
    if (program_info === null)
    {
        return;
    }

    const buffer = init_default_buffer(program_info);

    gl.useProgram(program_info.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    //default but still
    gl.frontFace(gl.CCW);

    initialize_spheres(SPHERES_AMOUNT);

    if (bind_uniforms() === null)
    {
        alert("error when binding uniforms");

        return;
    }

    requestAnimationFrame(draw_frame);
}

function init_default_buffer(program_info)
{
    const position_buffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, position_buffer);

    const positions = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
        program_info.attribute_locations.vertex_position,
        2, //positions per vertex
        gl.FLOAT,
        false, //no normalization
        0, //calculate stride automatically
        0 //no offset
    );

    gl.enableVertexAttribArray(program_info.attribute_locations.vertex_position);

    return position_buffer;
}

function attributes_info()
{
    const shader_program = load_program();
    if (shader_program === null)
    {
        return null;
    }

    const get_attrib = name => gl.getAttribLocation(shader_program, name);

    const program_info =
    {
        program: shader_program,
        attribute_locations:
        {
            vertex_position: get_attrib("a_vertex_position")
        },
        uniform_locations: {}
    };

    const add_uniform = name =>
    {
        program_info.uniform_locations[name] = gl.getUniformLocation(shader_program, name);
    };

    add_uniform("spheres_pos");
    add_uniform("spheres_size");
    add_uniform("spheres_color");
    add_uniform("spheres_luminance");
    add_uniform("spheres_smoothness");

    add_uniform("camera_pos");
    add_uniform("camera_forward_n");
    add_uniform("camera_right_n");
    add_uniform("camera_up_n");

    add_uniform("frame_seed");

    return program_info;
}

function load_program()
{
    const vertex_shader = load_shader(v_shader, gl.VERTEX_SHADER);
    const fragment_shader = load_shader(f_shader, gl.FRAGMENT_SHADER);

    if (vertex_shader === null || fragment_shader === null)
    {
        return null;
    }

    const shader_program = gl.createProgram();
    gl.attachShader(shader_program, vertex_shader);
    gl.attachShader(shader_program, fragment_shader);
    gl.linkProgram(shader_program);

    if (!gl.getProgramParameter(shader_program, gl.LINK_STATUS))
    {
        const program_log = gl.getProgramInfoLog(shader_program);
        alert(`error linking shader program 😭: ${program_log}`);

        return null;
    } else
    {
        return shader_program;
    }
}

function load_shader(source, type)
{
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    {
        let type_stringified = "unknown";
        if (type === gl.VERTEX_SHADER)
        {
            type_stringified = "vertex";
        } else if (type === gl.FRAGMENT_SHADER)
        {
            type_stringified = "fragment";
        }

        const shader_log = gl.getShaderInfoLog(shader);
        alert(`error compiling shader 😭 (${type_stringified} type): ${shader_log}`);

        gl.deleteShader(shader);
        return null;
    } else
    {
        return shader;
    }
}
