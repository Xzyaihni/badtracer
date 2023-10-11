const canvas = new OffscreenCanvas(640, 640);
const gl = canvas.getContext("webgl2");

const display_canvas = document.getElementById("display_canvas");
const display_context = display_canvas.getContext("2d");

let spheres_pos = [];
let spheres_size = [];
let spheres_color = [];
let spheres_luminance = [];
let spheres_smoothness = [];

let program_info = null;

let rendered_image = null;

let frame_index = 0;
const max_rays = 1000;

document.addEventListener("DOMContentLoaded", main);
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

function mix_frame()
{
    const width = canvas.width;
    const height = canvas.height;

    const total_size = width * height * 4;

    let canvas_image = new Uint8ClampedArray(total_size);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, canvas_image);

    const display_image = display_context.getImageData(0, 0, width, height).data;

    if (rendered_image === null)
    {
        rendered_image = new Float64Array(total_size);

        for(let i = 0; i < total_size; ++i)
        {
            const this_pixel = display_image[i];

            rendered_image[i] = this_pixel;

            canvas_image[i] = this_pixel;
        }
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

function draw_frame()
{
    bind_per_frame_uniforms();

    //draw the rectangle with everything on it
    //0 offset 4 vertices
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    mix_frame();

    frame_index += 1;

    if (frame_index < max_rays)
    {
        requestAnimationFrame(draw_frame);
    }
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
            z: -Math.random() * 0.7 + 0.2
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
